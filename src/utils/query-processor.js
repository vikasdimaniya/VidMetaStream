// src/utils/query-processor
const queryService = require('../services/query-processor.js');
const timeWindowsUtils = require('../utils/time-windows.js');
const gridFSStorage = require('../services/chunk-storage.js');
const fs = require('fs');
const db = require('../db');
const core = require('../../core.js');
const path = require('path');
const logFilePath = path.join(__dirname, 'timestamp_analysis.log');
// Utility to log to a file
const logToFile = (message) => {
    fs.appendFileSync(logFilePath, `${message}\n`);
};

// Import getInstanceData directly from queryService
const getInstanceData = queryService.getInstanceData;

const incrementTimestamp = (currentTimestamp) => {
    // Extract the whole number part and the fractional part
    const wholePart = Math.floor(currentTimestamp);
    let fractionalPart = parseFloat((currentTimestamp % 1).toFixed(3)); // e.g., 0.366

    // Convert fractional part to milliseconds for easier manipulation
    let milliseconds = Math.round(fractionalPart * 1000); // e.g., 366

    // Determine the last digit of the milliseconds
    const lastDigit = milliseconds % 10;

    // Define increment based on the last digit
    let increment;
    if (lastDigit === 0) {
        increment = 33; // from 0 to 3
    } else if (lastDigit === 3) {
        increment = 33; // from 3 to 6
    } else if (lastDigit === 6) {
        increment = 34; // from 6 to next second (0)
    } else {
        throw new Error(`Unexpected millisecond ending: ${milliseconds}`);
    }

    // Calculate the new milliseconds
    milliseconds += increment;

    // Handle overflow if milliseconds reach or exceed 1000
    if (milliseconds >= 1000) {
        milliseconds -= 1000;
        return wholePart + 1 + (milliseconds / 1000);
    }

    // Normalize to three decimal places
    const newFractionalPart = parseFloat((milliseconds / 1000).toFixed(3));

    // Combine the whole part with the new fractional part
    return wholePart + newFractionalPart;
};


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
                    const frameTimestampInSeconds = parseFloat(frame.timestamp.split(":").reduce((acc, time, idx) => {
                        return acc + time * Math.pow(60, 2 - idx); // Convert HH:MM:SS.SSS to seconds
                    }, 0));

                    if (frameTimestampInSeconds === currentTimestamp) {
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

/**
 * Checks if a relative position satisfies the area requirement.
 * @param {Array} relativePosition - The [x, y] coordinates of the relative position.
 * @param {Array} area - The area bounds as [x1, y1, x2, y2].
 * @returns {boolean} - Returns true if the relative position satisfies the area, otherwise false.
 */
const isPositionInArea = (relativePosition, area) => {
    if (!relativePosition || relativePosition.length !== 2 || !area || area.length !== 4) {
        throw new Error('Invalid relative position or area');
    }

    const [x, y] = relativePosition;
    const [x1, y1, x2, y2] = area;

    // Check if the position is within the bounds of the area
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
};


const findInstanceOverlaps = (instances, count) => {
    const overlaps = [];

    // Group instances by video_id
    const instancesByVideo = instances.reduce((acc, instance) => {
        acc[instance.video_id] = acc[instance.video_id] || [];
        acc[instance.video_id].push(instance);
        return acc;
    }, {});

    // For each video, find overlaps
    for (const [video_id, videoInstances] of Object.entries(instancesByVideo)) {
        const overlappingWindows = [];

        // Generate combinations of instances based on the count
        const combinations = getCombinations(videoInstances, count);

        // Check overlaps for each combination
        combinations.forEach((combo) => {
            const overlapStart = Math.max(...combo.map((inst) => inst.start_time));
            const overlapEnd = Math.min(...combo.map((inst) => inst.end_time));

            if (overlapStart < overlapEnd) {
                overlappingWindows.push({
                    start_time: overlapStart,
                    end_time: overlapEnd,
                    instances: combo.map((inst) => inst._id),
                });
            }
        });

        if (overlappingWindows.length > 0) {
            overlaps.push({
                video_id,
                overlaps: overlappingWindows,
            });
        }
    }

    return overlaps;
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
        const { video_id, start_time, end_time, _id: instance_id } = doc;

        // Normalize start_time and end_time
        const normalizedStartTime = parseFloat(start_time.$numberDecimal || start_time);
        const normalizedEndTime = parseFloat(end_time.$numberDecimal || end_time);

        // Check if the time falls within the object's time range
        if (time >= normalizedStartTime && time <= normalizedEndTime) {
            results.push({
                video_id,
                instance_id,
            });
        }
    });

    console.log(`Matching instances for object_name=${object_name} at time=${time.toFixed(3)} seconds:`, results);

    return results;
};


module.exports = {
    getInstancesByObjectAndTime,
    //gets distinct instance object data from service
    getInstanceData: queryService.getInstanceData,
    queryInstanceOverlaps,
    findInstanceOverlaps,
    filterOverlapsForVideo,
    mergeOverlappingIntervals,
    queryObjects: async (objects, windowSize) => {
        let results = {}; // Initialize results object to store merged windows by video_id

        // Query the first object to get the initial set of video results
        let initialObjectResults = await queryService.queryVideos(objects[0]);

        // Iterate over each result from the first query
        for (let videoResult of initialObjectResults) {
            let initialWindow = timeWindowsUtils.getTimings(videoResult); // Get timings for the current result
            let activeWindows = [initialWindow]; // Initialize active windows for the first object

            // Process the remaining objects
            for (let objectIndex = 1; objectIndex < objects.length; objectIndex++) {
                let nextObjectWindows = []; // Store results for the current object

                // Check for overlapping windows in the current time frame
                for (let activeWindow of activeWindows) {
                    // Query for overlapping windows within the current time window
                    let overlappingWindows = await queryService.queryVideosWithInSpecificTime(
                        videoResult.video_id,
                        objects[objectIndex],
                        activeWindow.startTime,
                        activeWindow.endTime
                    );

                    // Iterate over the overlapping windows and calculate new windows
                    for (let overlapWindow of overlappingWindows) {
                        let currentWindow = timeWindowsUtils.getTimings(overlapWindow); // Get timings for the current result
                        let calculatedWindow = timeWindowsUtils.calculateOverlapingTimings(currentWindow, activeWindow); // Calculate overlapping time windows
                        nextObjectWindows.push(calculatedWindow); // Add the new window to the results
                    }
                }

                // Update active windows for the next iteration
                activeWindows = nextObjectWindows;
            }

            // If valid windows are found, add them to the results object
            if (activeWindows.length > 0) {
                if (results.hasOwnProperty(videoResult.video_id)) {
                    // Append new windows to existing windows for this video_id
                    results[videoResult.video_id].windows = [...results[videoResult.video_id].windows, ...activeWindows];
                } else {
                    // Initialize windows for this video_id
                    results[videoResult.video_id] = { windows: activeWindows };
                }
            }
        }

        // Merge overlapping or contiguous windows for all video IDs
        results = timeWindowsUtils.mergeTimeWindows(results);

        // Format results into an array of objects with video_id and corresponding windows
        let formattedResults = [];
        for (let videoId of Object.keys(results)) {
            formattedResults.push({
                video_id: videoId,
                windows: results[videoId].windows,
            });
        }
        // remove videos whose windows are less than the window size
        if(windowSize) {
            formattedResults = formattedResults.filter((result) => {
                return result.windows.length >= windowSize;
            });
        }
        return formattedResults; // Return the formatted results
    },
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
    
                if (isWithinRegion([x, y], area)) {
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
    //CHECK IF WORKING FOR MULTIPLE VIDEOS
    querySpatialObjectsAnd: async ({ objects, area }) => {
        // Step 1: Use the existing querySpatialObjects function to get all valid windows
        const allObjectsWindows = await module.exports.querySpatialObjects({ objects, area });
    
        // Step 2: Transform the results to a map for easier processing
        const windowsByObject = {};
        for (const entry of allObjectsWindows) {
            windowsByObject[entry.object_name] = entry.windows;
        }
    
        // Step 3: Ensure all requested objects have data
        const objectsWithWindows = Object.keys(windowsByObject);
        if (!objects.every((obj) => objectsWithWindows.includes(obj))) {
            return []; // No overlap possible if any object is missing
        }
    
        // Step 4: Compute the intersection of windows across all objects
        const intersectedWindows = intersectWindows(objects.map((obj) => windowsByObject[obj]));
    
        // Step 5: Format the results with combined object names
        const result = {
            video_id: allObjectsWindows[0]?.video_id, // Assuming all entries share the same video_id
            objects: [
                {
                    object_names: objects, // Keep the objects as an array
                    windows: intersectedWindows,
                },
            ],
        };
        return [result];
    },      

    getFramesByTimeAndArea: (video_id, object_name, start_time, end_time, area) => {
        const [x1, y1, x2, y2] = area;
    
        // Query the database for frames within the specified time range and area
        return db.frames.find({
            video_id,
            object_name,
            timestamp: { $gte: start_time, $lte: end_time },
            "relative_position.0": { $gte: x1, $lte: x2 }, // x-coordinate
            "relative_position.1": { $gte: y1, $lte: y2 }  // y-coordinate
        });
    },
    // query spatial objects async func handler
    // - logic to find objects at specified locations
    // Logic to find objects at specified locations
    querySpatialObjects: async ({ objects, area }) => {
        const results = [];

        // Fetch objects from the service
        const objectData = await queryService.getObjectData(objects);

        for (const obj of objectData) {
            const { video_id, object_name, frames } = obj;

            const validWindows = [];
            let currentWindowStart = null;

            for (const frame of frames) {
                const [x, y] = frame.relative_position;

                // Check if the relative position is within the specified area
                if (isWithinRegion([x, y], area)) {
                    if (currentWindowStart === null) {
                        currentWindowStart = frame.timestamp; // Start a new window
                    }
                } else {
                    // Close the current window if it exists
                    if (currentWindowStart !== null) {
                        validWindows.push({
                            start_time: currentWindowStart,
                            end_time: frame.timestamp,
                        });
                        currentWindowStart = null; // Reset the window
                    }
                }
            }

            // Add the last window if it was still open
            if (currentWindowStart !== null) {
                validWindows.push({
                    start_time: currentWindowStart,
                    end_time: frames[frames.length - 1].timestamp,
                });
            }

            // Merge or refine windows if necessary
            const mergedWindows = timeWindowsUtils.mergeWindows
                ? timeWindowsUtils.mergeWindows(validWindows)
                : validWindows;

            // Only include results with valid windows
            if (mergedWindows.length > 0) {
                results.push({
                    video_id,
                    object_name,
                    windows: mergedWindows,
                });
            }
        }

        return results;
    },
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
     * Queries for video segments where objects appear in a specified sequence.
     * @param {Array} sequence - An array of object names in the order they should appear.
     * @param {number} windowSize - Minimum duration for the sequence.
     * @returns {Promise<Array>} - An array of video sections with the sequence.
     */
    querySequence: async (sequence, windowSize) => {
        const objectData = await queryService.getObjectData(sequence);

        // Organize object data by video_id
        console.log(objectData);
        let objectIntervals = {};
        for (let object in objects) {
            if (!objectIntervals.hasOwnProperty(object.object_name)) {
                objectIntervals[object.object_name] = [object.start_time];
            } else {
                objectIntervals[object.object_name].push(object.start_time);
            }
        }

        
    },
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

// helper function for combinations of distinct instance types
const getCombinations = (array, size) => {
    if (size > array.length) return [];
    const results = [];
    const combination = (start, depth, prefix) => {
        if (depth === 0) {
            results.push(prefix);
            return;
        }
        for (let i = start; i <= array.length - depth; i++) {
            combination(i + 1, depth - 1, [...prefix, array[i]]);
        }
    };
    combination(0, size, []);
    return results;
    
}
// Helper function to check if a point is within a defined region
const isWithinRegion = (point, region) => {
    const [x1, y1, x2, y2] = region;
    const [x, y] = point;
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
};