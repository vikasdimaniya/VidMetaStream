// src/utils/query-processor
import queryService from '../services/query-processor.js';
import timeWindowsUtils from './time-windows.js';
import gridFSStorage from '../services/chunk-storage.js';
import { convertTimeToSeconds, interpretRelativeArea, isPositionInArea as isPositionInAreaUtil, secondsToTime, incrementTimestamp } from './spatial-utils.js';
import { SpatialIndex } from './spatial-index.js';
import fs from 'fs';
import db from '../db.js';
import core from '../../core.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logFilePath = path.join(__dirname, 'timestamp_analysis.log');
// Utility to log to a file
const logToFile = (message) => {
    fs.appendFileSync(logFilePath, `${message}\n`);
};

// Import getInstanceData directly from queryService
const getInstanceData = queryService.getInstanceData;

// Constants
const EPSILON = 0.001; // For floating-point comparisons (1ms tolerance)

// Use incrementTimestamp from spatial-utils (already imported above)

const getDocumentsByVideoId = async (video_id, object_name) => {
    const documents = await db.objects.find({
        video_id,
        object_name, // Only fetch documents where object_name matches
    });

    return documents; // Returns an array of matching documents
};

//Just add loggin back to file, and review area classification logic
const filterOverlapsForVideo = async (video_id, object, merged_overlaps, count, area) => {
    console.log(`filterOverlapsForVideo called with:`);
    console.log(`video_id=${video_id}`);
    // console.log(`object=${object}`);
    console.log(`count=${count}`);
    // console.log(`area=${JSON.stringify(area)}`);
    // console.log(`merged_overlaps=${JSON.stringify(merged_overlaps, null, 2)}`);
    
    const documents = await getDocumentsByVideoId(video_id, object);

    if (!documents || documents.length === 0) {
        console.log('No documents found for the specified video_id');
        return [];
    }

    console.log(`Number of documents retrieved for video_id=${video_id}: ${documents.length}`);

    const successIntervals = [];

    // Log the intervals of time of interest
    console.log(`Time intervals of interest for video_id=${video_id}:`);
    merged_overlaps.forEach(({ start_time: overlapStart, end_time }) => {
        console.log(`Processing time interval -> Start: ${overlapStart}, End: ${end_time}`);

        let currentTimestamp = overlapStart;
        let consecutiveSuccessCount = 0;
        let consecutiveFailureCount = 0;
        let successStartTime = null;

        while (currentTimestamp <= end_time) {
            console.log(`Checking timestamp: ${currentTimestamp.toFixed(3)}`);
            let matchCount = 0;

            for (const [index, doc] of documents.entries()) {
                const { frames } = doc;

                if (!frames || !Array.isArray(frames)) {
                    console.log(`Document #${index + 1} has no valid frames array.`);
                    continue;
                }

                for (const frame of frames) {
                    // Parse timestamp properly: HH:MM:SS.SSS to seconds
                    const parts = frame.timestamp.split(":");
                    const hours = parseFloat(parts[0]);
                    const minutes = parseFloat(parts[1]);
                    const seconds = parseFloat(parts[2]);
                    const frameTimestampInSeconds = hours * 3600 + minutes * 60 + seconds;

                    // Use epsilon comparison for floating-point timestamps
                    if (Math.abs(frameTimestampInSeconds - currentTimestamp) < EPSILON) {
                        const positionMatches = isPositionInArea(frame.relative_position, area);
                        if (positionMatches) {
                            matchCount++;
                            if (matchCount >= count) break;
                        }
                    }
                }

                if (matchCount >= count) break;
            }

            if (matchCount >= count) {
                consecutiveSuccessCount++;
                consecutiveFailureCount = 0;

                if (consecutiveSuccessCount === 1) {
                    successStartTime = currentTimestamp;
                }
            } else {
                consecutiveFailureCount++;
                consecutiveSuccessCount = 0;

                if (consecutiveFailureCount === 2 && successStartTime !== null) {
                    successIntervals.push({
                        start: successStartTime.toFixed(3),
                        end: (currentTimestamp - 0.033).toFixed(3),
                    });
                    successStartTime = null;
                }
            }

            currentTimestamp = incrementTimestamp(currentTimestamp); // Use the increment logic
        }

        // Handle case where a success interval continues to the end
        if (successStartTime !== null) {
            successIntervals.push({
                start: successStartTime.toFixed(3),
                end: end_time.toFixed(3),
            });
        }
    });

    console.log(`Success intervals for video_id=${video_id}:`, successIntervals);

    return successIntervals; // Return the successful intervals
};

// Use isPositionInArea from spatial-utils (imported as isPositionInAreaUtil)
// Keeping local reference for backward compatibility
const isPositionInArea = isPositionInAreaUtil;

/**
 * Find overlaps between instances of the same object
 * @param {Array} instances - Array of instances
 * @param {number} count - Minimum number of instances that must overlap
 * @returns {Array} - Array of overlaps
 */
const findInstanceOverlaps = (instances, count) => {
    // Optimization: Use a sweep line algorithm for O(n log n) complexity
    // instead of the previous O(n²) approach with nested loops
    
    // Create events for start and end of each instance
    const events = [];
    
    instances.forEach(instance => {
        // Convert time strings to numbers if needed
        const startTime = typeof instance.start_time === 'string' 
            ? convertTimeToSeconds(instance.start_time) 
            : instance.start_time;
            
        const endTime = typeof instance.end_time === 'string'
            ? convertTimeToSeconds(instance.end_time)
            : instance.end_time;
            
        events.push({
            time: startTime,
            type: 'start',
            instance
        });
        
        events.push({
            time: endTime,
            type: 'end',
            instance
        });
    });
    
    // Sort events by time
    events.sort((a, b) => {
        // If times are equal, process end events before start events
        if (a.time === b.time) {
            return a.type === 'end' ? -1 : 1;
        }
        return a.time - b.time;
    });
    
    // Sweep through events
    const activeInstances = new Set();
    const overlaps = [];
    let currentOverlap = null;
    
    for (const event of events) {
        if (event.type === 'start') {
            // Add instance to active set
            activeInstances.add(event.instance);
            
            // Check if we have enough active instances
            if (activeInstances.size >= count && !currentOverlap) {
                // Start a new overlap
                currentOverlap = {
                    start_time: event.time,
                    instances: Array.from(activeInstances),
                    video_id: event.instance.video_id
                };
            }
        } else {
            // Remove instance from active set
            activeInstances.delete(event.instance);
            
            // Check if we drop below the required count
            if (activeInstances.size < count && currentOverlap) {
                // End the current overlap
                currentOverlap.end_time = event.time;
                overlaps.push(currentOverlap);
                currentOverlap = null;
            }
        }
    }
    
    // Group overlaps by video_id
    const overlapsByVideo = {};
    
    for (const overlap of overlaps) {
        const videoId = overlap.video_id;
        
        if (!overlapsByVideo[videoId]) {
            overlapsByVideo[videoId] = {
                video_id: videoId,
                overlaps: []
            };
        }
        
        // Remove video_id from the overlap object
        const { video_id, ...overlapWithoutVideoId } = overlap;
        
        overlapsByVideo[videoId].overlaps.push(overlapWithoutVideoId);
    }
    
    return Object.values(overlapsByVideo);
};

//merge overlaps from instances of overlaps to conious start and end of overlaps
/**
 * Merges overlapping or contiguous intervals.
 * @param {Array<Object>} overlapData - Array of overlaps grouped by video_id.
 * @returns {Array<Object>} Merged intervals grouped by video_id.
 */
const mergeOverlappingIntervals = (overlapData) => {
    const mergedResults = [];

    overlapData.forEach(videoOverlap => {
        const { video_id, overlaps } = videoOverlap;

        // Handle empty overlaps array
        if (!overlaps || overlaps.length === 0) {
            return;
        }

        // Sort overlaps by start time
        overlaps.sort((a, b) => a.start_time - b.start_time);

        const mergedIntervals = [];
        let currentInterval = { start_time: overlaps[0].start_time, end_time: overlaps[0].end_time };

        // Merge continuous or overlapping intervals
        for (let i = 1; i < overlaps.length; i++) {
            const nextInterval = overlaps[i];

            if (nextInterval.start_time <= currentInterval.end_time) {
                // Extend the current interval
                currentInterval.end_time = Math.max(currentInterval.end_time, nextInterval.end_time);
            } else {
                // Push the current interval and start a new one
                mergedIntervals.push(currentInterval);
                currentInterval = { start_time: nextInterval.start_time, end_time: nextInterval.end_time };
            }
        }

        // Push the last interval
        mergedIntervals.push(currentInterval);

        // Add the result for this video
        mergedResults.push({
            video_id,
            merged_overlaps: mergedIntervals,
        });
    });

    return mergedResults;
};


const queryInstanceOverlaps = async ({ object, count }) => {
    // Step 1: Fetch instances of the given object
    const instances = await getInstanceData([object]);

    // Step 2: Find overlaps
    const overlaps = findInstanceOverlaps(instances, count);

    // Step 3: Merge overlapping intervals
    const mergedOverlaps = mergeOverlappingIntervals(overlaps);

    return mergedOverlaps;
};

const getInstancesByObjectAndTime = async (object_name, time) => {
    console.log(`getFramesByObjectAndTime called with object_name=${object_name} and time=${time.toFixed(3)} seconds`);

    // Fetch documents matching the object name
    const documents = await db.objects.find({ object_name });

    if (!documents || documents.length === 0) {
        console.log(`No documents found for object_name=${object_name}`);
        return [];
    }

    console.log(`Number of documents retrieved for object_name=${object_name}: ${documents.length}`);

    // Filter instances based on the given time
    const results = [];

    documents.forEach((doc) => {
        const { video_id, start_time, end_time, _id: instance_id, frames, object_name: objName } = doc;

        // Safely normalize start_time and end_time handling Decimal128, null, and undefined
        const normalizedStartTime = start_time?.$numberDecimal 
            ? parseFloat(start_time.$numberDecimal) 
            : (parseFloat(start_time) || 0);
        
        const normalizedEndTime = end_time?.$numberDecimal 
            ? parseFloat(end_time.$numberDecimal) 
            : (parseFloat(end_time) || 0);

        // Skip if we got invalid values
        if (isNaN(normalizedStartTime) || isNaN(normalizedEndTime)) {
            console.log(`Skipping document with invalid timestamps: start=${start_time}, end=${end_time}`);
            return;
        }

        // Check if the time falls within the object's time range
        if (time >= normalizedStartTime && time <= normalizedEndTime) {
            // Find the frame closest to the requested time
            let closestFrame = null;
            let minDiff = Infinity;
            
            if (frames && frames.length > 0) {
                frames.forEach(frame => {
                    const frameTime = frame.timestamp?.$numberDecimal 
                        ? parseFloat(frame.timestamp.$numberDecimal) 
                        : parseFloat(frame.timestamp);
                    
                    if (!isNaN(frameTime)) {
                        const diff = Math.abs(frameTime - time);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closestFrame = {
                                timestamp: frameTime,
                                relative_position: frame.relative_position,
                                bounding_box: frame.bounding_box
                            };
                        }
                    }
                });
            }

            results.push({
                video_id: video_id.toString(),
                instance_id: instance_id.toString(),
                object_name: objName,
                start_time: normalizedStartTime,
                end_time: normalizedEndTime,
                frame_at_time: closestFrame
            });
        }
    });

    // console.log(`Matching instances for object_name=${object_name} at time=${time.toFixed(3)} seconds:`, results);

    return results;
};

/**
 * Filters spatial results based on a temporal window.
 * 
 * @param {Array} spatialResults - Array of spatial results with object windows.
 * @param {number} startTime - Start time of the temporal window.
 * @param {number} endTime - End time of the temporal window.
 * @returns {Array} - Filtered spatial results with windows adjusted to the temporal window.
 */
const filterByTimeWindow = async (spatialResults, startTime, endTime) => {
    return spatialResults.map((entry) => {
        const filteredWindows = entry.windows.filter((window) => {
            const windowStart = parseFloat(window.start_time);
            const windowEnd = parseFloat(window.end_time);
            return windowStart < endTime && windowEnd > startTime;
        }).map((window) => ({
            start_time: Math.max(parseFloat(window.start_time), startTime).toFixed(3),
            end_time: Math.min(parseFloat(window.end_time), endTime).toFixed(3),
        }));

        return {
            ...entry,
            windows: filteredWindows,
        };
    }).filter((entry) => entry.windows.length > 0); // Remove entries with no valid windows
};

/**
 * Count the number of spatial objects matching the query
 * @param {Object} params - Query parameters
 * @param {Array} params.objects - Array of object names
 * @param {Array|string} params.area - Area as [x1, y1, x2, y2] or named area
 * @returns {Promise<number>} - Number of matching objects
 */
const countSpatialObjects = async ({ objects, area }) => {
    // Parse area if it's a string
    if (typeof area === 'string') {
        if (area.startsWith('[')) {
            area = JSON.parse(area);
        } else {
            // It's a named area, use the interpretRelativeArea function
            area = interpretRelativeArea(area);
            if (!area) {
                throw new Error(`Invalid area description: ${area}`);
            }
        }
    }
    
    // Create query for MongoDB
    const query = {
        object_name: { $in: objects },
        'frames': {
            $elemMatch: {
                'relative_position.0': { $gte: area[0], $lte: area[2] }, // x coordinate
                'relative_position.1': { $gte: area[1], $lte: area[3] }  // y coordinate
            }
        }
    };
    
    // Count documents
    const count = await db.objects.countDocuments(query);
    
    return count;
};

/**
 * Query for spatial objects with pagination
 * @param {Object} params - Query parameters
 * @param {Array} params.objects - Array of object names
 * @param {Array|string} params.area - Area as [x1, y1, x2, y2] or named area
 * @param {number} skip - Number of documents to skip
 * @param {number} limit - Maximum number of documents to return
 * @returns {Promise<Array>} - Array of matching objects
 */
const querySpatialObjectsWithPagination = async ({ objects, area }, skip, limit) => {
    // Parse area if it's a string
    if (typeof area === 'string') {
        if (area.startsWith('[')) {
            area = JSON.parse(area);
        } else {
            // It's a named area, use the interpretRelativeArea function
            area = interpretRelativeArea(area);
            if (!area) {
                throw new Error(`Invalid area description: ${area}`);
            }
        }
    }
    
    // Use the spatial index (imported at top of file)
    const index = new SpatialIndex();
    
    // Get all objects for the specified object types
    const allObjects = await db.objects.find({
        object_name: { $in: objects }
    }).toArray();
    
    // Build the spatial index
    index.buildFromObjects(allObjects);
    
    // Query the spatial index for objects in the specified area
    const results = [];
    
    for (const objectName of objects) {
        const objectsOfType = allObjects.filter(obj => obj.object_name === objectName);
        
        for (const obj of objectsOfType) {
            const objectId = obj._id.toString();
            const videoId = obj.video_id;
            
            // Check if this object is in the specified area
            const matchingIds = index.query(videoId, area);
            
            if (matchingIds.includes(objectId)) {
                results.push(obj);
            }
        }
    }
    
    // Apply pagination
    return results.slice(skip, skip + limit);
};

/**
 * Get a MongoDB cursor for a query
 * @param {Object} params - Query parameters
 * @param {Array} params.objects - Array of object names
 * @returns {Promise<Object>} - MongoDB cursor
 */
const getQueryCursor = async ({ objects }) => {
    // Create query for MongoDB
    const query = {
        object_name: { $in: objects }
    };
    
    // Create cursor
    const cursor = db.objects.find(query);
    
    return cursor;
};

// Merge helper function for logical OR object spatial queries
const mergeWindows = (windows) => {
    if (windows.length === 0) return [];
    
    // Sort windows by start time
    windows.sort((a, b) => new Date(`1970-01-01T${a.start_time}Z`) - new Date(`1970-01-01T${b.start_time}Z`));

    const merged = [windows[0]];

    for (let i = 1; i < windows.length; i++) {
        const prev = merged[merged.length - 1];
        const current = windows[i];

        const prevEndTime = new Date(`1970-01-01T${prev.end_time}Z`);
        const currentStartTime = new Date(`1970-01-01T${current.start_time}Z`);

        if (currentStartTime <= prevEndTime) {
            // Merge overlapping or contiguous windows
            prev.end_time = new Date(Math.max(prevEndTime, new Date(`1970-01-01T${current.end_time}Z`)))
                .toISOString()
                .split('T')[1]
                .slice(0, 12); // Keep only time with milliseconds
        } else {
            merged.push(current);
        }
    }

    return merged;
};

// Helper to compute intersection of windows query objects logical AND
const intersectWindows = (windowsList) => {
    if (!windowsList || windowsList.length === 0) return [];

    let intersection = windowsList[0]; // Start with the first object's windows

    for (let i = 1; i < windowsList.length; i++) {
        const current = windowsList[i];
        const tempIntersection = [];

        let j = 0, k = 0;

        while (j < intersection.length && k < current.length) {
            const start = Math.max(
                new Date(`1970-01-01T${intersection[j].start_time}Z`),
                new Date(`1970-01-01T${current[k].start_time}Z`)
            );
            const end = Math.min(
                new Date(`1970-01-01T${intersection[j].end_time}Z`),
                new Date(`1970-01-01T${current[k].end_time}Z`)
            );

            if (start < end) {
                tempIntersection.push({
                    start_time: new Date(start).toISOString().split('T')[1].slice(0, 12),
                    end_time: new Date(end).toISOString().split('T')[1].slice(0, 12),
                });
            }

            // Move the pointer with the earlier end time
            if (
                new Date(`1970-01-01T${intersection[j].end_time}Z`) <
                new Date(`1970-01-01T${current[k].end_time}Z`)
            ) {
                j++;
            } else {
                k++;
            }
        }

        intersection = tempIntersection; // Update with the latest intersection
    }

    return intersection;
};

// getCombinations removed - was unused
// isWithinRegion removed - use isPositionInArea instead

/**
 * Query for videos where objects appear together within a time window
 * @param {Array} objects - Array of object names to search for
 * @param {number} windowSize - Optional maximum time window size in seconds
 * @returns {Promise<Array>} - Array of video sections where objects appear together
 */
const queryObjects = async (objects, windowSize) => {
    try {
        // Get all data for the requested objects
        const objectData = await queryService.getObjectData(objects);
        
        if (!objectData || objectData.length === 0) {
            return [];
        }
        
        // Group by video_id
        const videoGroups = {};
        for (const obj of objectData) {
            const { video_id, object_name, start_time, end_time } = obj;
            
            if (!videoGroups[video_id]) {
                videoGroups[video_id] = {};
            }
            
            if (!videoGroups[video_id][object_name]) {
                videoGroups[video_id][object_name] = [];
            }
            
            videoGroups[video_id][object_name].push({
                start_time,
                end_time
            });
        }
        
        const results = [];
        
        // For each video, find time windows where all objects appear
        for (const [video_id, videoObjects] of Object.entries(videoGroups)) {
            // Check if all requested objects exist in this video
            const objectNames = Object.keys(videoObjects);
            if (!objects.every(obj => objectNames.includes(obj))) {
                continue; // Skip this video if not all objects are present
            }
            
            // Find overlapping time windows for all objects
            const windows = findOverlappingWindows(videoObjects, objects, windowSize);
            
            if (windows.length > 0) {
                results.push({
                    video_id,
                    windows
                });
            }
        }
        
        return results;
    } catch (error) {
        console.error('Error in queryObjects:', error);
        throw error;
    }
};

/**
 * Helper function to find overlapping time windows for multiple objects
 * @param {Object} videoObjects - Object containing arrays of time ranges for each object
 * @param {Array} objects - Array of object names
 * @param {number} windowSize - Optional maximum window size
 * @returns {Array} - Array of overlapping windows
 */
const findOverlappingWindows = (videoObjects, objects, windowSize) => {
    // Get all time ranges for the first object
    const firstObject = objects[0];
    const firstRanges = videoObjects[firstObject];
    
    const overlaps = [];
    
    // For each time range of the first object
    for (const firstRange of firstRanges) {
        let overlapStart = firstRange.start_time;
        let overlapEnd = firstRange.end_time;
        let validOverlap = true;
        
        // Check overlap with all other objects
        for (let i = 1; i < objects.length; i++) {
            const currentObject = objects[i];
            const currentRanges = videoObjects[currentObject];
            
            // Find any overlapping range
            let hasOverlap = false;
            for (const currentRange of currentRanges) {
                // Check if ranges overlap
                if (currentRange.start_time < overlapEnd && currentRange.end_time > overlapStart) {
                    // Update overlap window to intersection
                    overlapStart = Math.max(overlapStart, currentRange.start_time);
                    overlapEnd = Math.min(overlapEnd, currentRange.end_time);
                    hasOverlap = true;
                    break;
                }
            }
            
            if (!hasOverlap) {
                validOverlap = false;
                break;
            }
        }
        
        // Check if overlap is valid and within window size
        if (validOverlap && overlapStart < overlapEnd) {
            const duration = overlapEnd - overlapStart;
            if (!windowSize || duration <= windowSize) {
                overlaps.push({
                    start_time: overlapStart,
                    end_time: overlapEnd
                });
            }
        }
    }
    
    // Merge overlapping windows
    return mergeNumericWindows(overlaps);
};

/**
 * Merge overlapping or contiguous numeric time windows
 * @param {Array} windows - Array of {start_time, end_time} objects
 * @returns {Array} - Merged windows
 */
const mergeNumericWindows = (windows) => {
    if (windows.length === 0) return [];
    
    // Sort by start_time
    windows.sort((a, b) => a.start_time - b.start_time);
    
    const merged = [windows[0]];
    
    for (let i = 1; i < windows.length; i++) {
        const current = windows[i];
        const last = merged[merged.length - 1];
        
        if (current.start_time <= last.end_time) {
            // Merge overlapping windows
            last.end_time = Math.max(last.end_time, current.end_time);
        } else {
            // Add non-overlapping window
            merged.push(current);
        }
    }
    
    return merged;
};

// Export all functions
export {
    getDocumentsByVideoId,
    filterOverlapsForVideo,
    isPositionInArea,
    findInstanceOverlaps,
    mergeOverlappingIntervals,
    queryInstanceOverlaps,
    getInstancesByObjectAndTime,
    filterByTimeWindow,
    mergeWindows,
    intersectWindows,
    countSpatialObjects,
    querySpatialObjectsWithPagination,
    getQueryCursor,
    queryObjects
};

// Create default export object
const queryProcessorUtils = {
    getDocumentsByVideoId,
    filterOverlapsForVideo,
    isPositionInArea,
    findInstanceOverlaps,
    mergeOverlappingIntervals,
    queryInstanceOverlaps,
    getInstancesByObjectAndTime,
    filterByTimeWindow,
    mergeWindows,
    intersectWindows,
    countSpatialObjects,
    querySpatialObjectsWithPagination,
    getQueryCursor,
    queryObjects,  // Query for videos where objects appear together
    //gets distinct instance object data from service
    getInstanceData: queryService.getInstanceData,
    getVideoChunk: async (videoId, windows) => {
        // Get matching files metadata for the specified time window
        let files = await gridFSStorage.getVideoFilesForTimeWindows(core.getGridFSBucket(), videoId, windows);
        return files;
    },

    //Logic for spatial queries logical OR of objects in space obj x OR y in area
    querySpatialObjects: async ({ objects, area }) => {
        const results = [];
        const objectData = await queryService.getObjectData(objects);
    
        for (const obj of objectData) {
            const { video_id, object_name, frames } = obj;
    
            const validWindows = [];
            let currentWindowStart = null;
    
            for (const frame of frames) {
                const [x, y] = frame.relative_position;
    
                if (isPositionInArea([x, y], area)) {
                    if (currentWindowStart === null) {
                        currentWindowStart = frame.timestamp;
                    }
                } else {
                    if (currentWindowStart !== null) {
                        validWindows.push({
                            start_time: currentWindowStart,
                            end_time: frame.timestamp,
                        });
                        currentWindowStart = null;
                    }
                }
            }
    
            if (currentWindowStart !== null) {
                validWindows.push({
                    start_time: currentWindowStart,
                    end_time: frames[frames.length - 1].timestamp,
                });
            }
    
            // Merge windows for the current object in the current video
            const mergedWindows = mergeWindows(validWindows);
    
            if (mergedWindows.length > 0) {
                // Check if this video_id and object_name already exist in the results
                const existingResult = results.find(
                    (result) => result.video_id === video_id && result.object_name === object_name
                );
    
                if (existingResult) {
                    // Merge existing windows with new merged windows
                    existingResult.windows = mergeWindows([...existingResult.windows, ...mergedWindows]);
                } else {
                    // Add a new entry for this video_id and object_name
                    results.push({
                        video_id,
                        object_name,
                        windows: mergedWindows,
                    });
                }
            }
        }
        return results;
    },    
    
    // Query objects by area inclusive logical AND, obj x AND obj y in area
    // Fixed to properly handle multiple videos
    querySpatialObjectsAnd: async ({ objects, area }) => {
        // Step 1: Use the existing querySpatialObjects function to get all valid windows
        const allObjectsWindows = await queryProcessorUtils.querySpatialObjects({ objects, area });
    
        // Step 2: Group by video_id first
        const windowsByVideo = {};
        for (const entry of allObjectsWindows) {
            const { video_id, object_name, windows } = entry;
            
            if (!windowsByVideo[video_id]) {
                windowsByVideo[video_id] = {};
            }
            
            // For each object in each video, merge windows if already exists
            if (!windowsByVideo[video_id][object_name]) {
                windowsByVideo[video_id][object_name] = windows;
            } else {
                // Merge windows for the same object in the same video
                windowsByVideo[video_id][object_name] = mergeWindows([
                    ...windowsByVideo[video_id][object_name],
                    ...windows
                ]);
            }
        }
    
        // Step 3: Process each video separately
        const results = [];
        
        for (const [video_id, videoObjects] of Object.entries(windowsByVideo)) {
            // Check if all requested objects exist in this video
            const objectsInVideo = Object.keys(videoObjects);
            if (!objects.every((obj) => objectsInVideo.includes(obj))) {
                continue; // Skip this video if not all objects are present
            }
            
            // Compute intersection of windows for all objects in this video
            const intersectedWindows = intersectWindows(objects.map((obj) => videoObjects[obj]));
            
            // Only add result if there are valid intersecting windows
            if (intersectedWindows.length > 0) {
                results.push({
                    video_id,
                    objects: [
                        {
                            object_names: objects,
                            windows: intersectedWindows,
                        },
                    ],
                });
            }
        }
        
        return results;
    },
    
    // getFramesByTimeAndArea removed - legacy code, uses db.frames collection that may not exist
    // Kept commented for reference:
    // getFramesByTimeAndArea: (video_id, object_name, start_time, end_time, area) => {
    //     const [x1, y1, x2, y2] = area;
    //     return db.frames.find({
    //         video_id,
    //         object_name,
    //         timestamp: { $gte: start_time, $lte: end_time },
    //         "relative_position.0": { $gte: x1, $lte: x2 },
    //         "relative_position.1": { $gte: y1, $lte: y2 }
    //     });
    // },
    /**
      * Fetch the file metadata by chunk ID.
      * @param {string} chunkId - The chunk's GridFS ID.
      * @returns {Promise<Object>} - Metadata of the file.
      */
    getChunk: async (chunkId) => {
        // Get the file metadata for the specified chunk ID
        let file = await gridFSStorage.getChunk(core.getGridFSBucket(), chunkId);
        return file;
    },
    downloadFileAsStream: async (fileId, destinationPath) => {
        return await gridFSStorage.downloadFileAsStream(core.getGridFSBucket(), fileId, destinationPath);
    },
    /**
     * Queries for video segments where objects appear in a specified sequence with a minimum window size.
     * @param {Array} sequence - An array of object names in the order they should appear.
     * @param {number} windowSize - Minimum duration for the sequence.
     * @returns {Promise<Array>} - An array of video sections with the sequence.
     */
    querySequence: async (sequence, windowSize) => {
        try {
            // Get data for all objects in the sequence
            const objectData = await queryService.getObjectData(sequence);
            
            if (!objectData || objectData.length === 0) {
                return [];
            }
            
            // Organize object data by video_id and object_name
            const videoObjects = {};
            
            for (const object of objectData) {
                const videoId = object.video_id;
                const objectName = object.object_name;
                
                if (!videoObjects[videoId]) {
                    videoObjects[videoId] = {};
                }
                
                if (!videoObjects[videoId][objectName]) {
                    videoObjects[videoId][objectName] = [];
                }
                
                videoObjects[videoId][objectName].push({
                    start_time: object.start_time,
                    end_time: object.end_time
                });
            }
            
            // Sort instances by start_time for efficient sequence detection
            for (const videoId in videoObjects) {
                for (const objectName in videoObjects[videoId]) {
                    videoObjects[videoId][objectName].sort((a, b) => a.start_time - b.start_time);
                }
            }
            
            // Find sequences in each video
            const results = [];
            
            // Use the exported findSequentialAppearances function defined below
            
            for (const videoId in videoObjects) {
                const videoData = videoObjects[videoId];
                
                // Check if all objects in the sequence are present in this video
                if (sequence.every(obj => videoData[obj] && videoData[obj].length > 0)) {
                    // Find sequences where objects appear in order
                    const sequenceWindows = queryProcessorUtils.findSequentialAppearances(videoData, sequence, windowSize);
                    
                    if (sequenceWindows.length > 0) {
                        results.push({
                            video_id: videoId,
                            windows: sequenceWindows.map(window => ({
                                start_time: queryProcessorUtils.formatTimestamp(window.start_time),
                                end_time: queryProcessorUtils.formatTimestamp(window.end_time)
                            }))
                        });
                    }
                }
            }
            
            return results;
        } catch (error) {
            console.error("Error in querySequence:", error);
            throw error;
        }
    },
    /**
     * Find time windows where objects appear in sequence
     * @param {Object} videoData - Object data organized by object name
     * @param {Array} sequence - Array of object names in order
     * @param {number} maxWindowSize - Maximum window size for the sequence
     * @returns {Array} - Array of time windows
     */
    findSequentialAppearances: (videoData, sequence, maxWindowSize) => {
        const windows = [];
        
        // Get all instances of the first object
        const firstObjectInstances = videoData[sequence[0]];
        
        if (!firstObjectInstances || firstObjectInstances.length === 0) {
            return windows;
        }
        
        for (const firstInstance of firstObjectInstances) {
            const startTime = firstInstance.start_time;
            let endTime = firstInstance.end_time;
            let validSequence = true;
            let previousEndTime = endTime;
            
            // For each subsequent object in the sequence
            for (let i = 1; i < sequence.length; i++) {
                const currentObject = sequence[i];
                const currentInstances = videoData[currentObject];
                
                if (!currentInstances || currentInstances.length === 0) {
                    validSequence = false;
                    break;
                }
                
                // Find the CLOSEST instance that starts at or after the previous object ends
                // This improves accuracy over just finding the first match
                let nextInstance = null;
                let minGap = Infinity;
                
                for (const instance of currentInstances) {
                    // Instance must start at or after previous ends
                    if (instance.start_time >= previousEndTime) {
                        const gap = instance.start_time - previousEndTime;
                        if (gap < minGap) {
                            minGap = gap;
                            nextInstance = instance;
                        }
                    }
                }
                
                if (!nextInstance) {
                    validSequence = false;
                    break;
                }
                
                // Update the end time
                endTime = nextInstance.end_time;
                previousEndTime = nextInstance.end_time;
                
                // Check if the window size exceeds the maximum
                if (maxWindowSize > 0 && (endTime - startTime) > maxWindowSize) {
                    validSequence = false;
                    break;
                }
            }
            
            if (validSequence) {
                windows.push({
                    start_time: startTime,
                    end_time: endTime
                });
            }
        }
        
        return windows;
    },
    /**
     * Format a timestamp as a string
     * @param {number} timestamp - Timestamp in seconds
     * @returns {string} - Formatted timestamp
     */
    formatTimestamp: (timestamp) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = Math.floor(timestamp % 60);
        const milliseconds = Math.round((timestamp % 1) * 1000);
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    },
};

// Default export
export default queryProcessorUtils;