/**
 * VIDEO QUERY API HANDLERS
 * 
 * This module provides all API handlers for querying video content based on:
 * - SPATIAL criteria (where objects appear in frame)
 * - TEMPORAL criteria (when objects appear in time)
 * - OBJECT RELATIONSHIPS (objects appearing together)
 * - SEQUENCES (objects appearing in specific order)
 * 
 * All handlers return time windows where query criteria are met,
 * enabling extraction of relevant video segments.
 */

import path from 'path';
import queryProcessorUtils from '../utils/query-processor.js';
import { ApiError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { 
    interpretRelativeArea, 
    validateArea, 
    convertTimeToSeconds, 
    secondsToTime 
} from '../utils/spatial-utils.js';

/**
 * QUERY INSTANCE OVERLAPS IN SPECIFIC AREA
 * 
 * PURPOSE: Find time periods when N or more instances of the SAME object
 * appear simultaneously in a specific screen area.
 * 
 * USE CASE: "Show me when at least 2 cars are in the parking area"
 * 
 * WHAT IT DOES:
 * 1. First finds all time periods when N+ instances overlap (any location)
 * 2. For each overlap period, checks frame-by-frame position data
 * 3. Counts instances that fall within the specified area at each frame
 * 4. Only keeps periods where N+ instances are in the area
 * 5. Returns filtered time intervals
 * 
 * INPUT PARAMETERS:
 * - object: Name of object type to search (e.g., "car", "person")
 * - count: Minimum number of simultaneous instances required (integer >= 2)
 * - area: Screen region - named (e.g., "top-left") or coordinates [x1,y1,x2,y2]
 * 
 * RETURNS:
 * {
 *   success: true,
 *   data: [
 *     {
 *       video_id: "video123",
 *       success_intervals: [
 *         { start: "10.500", end: "15.800" }  // Seconds as strings
 *       ]
 *     }
 *   ]
 * }
 * 
 * ALGORITHM: Overlap detection + spatial filtering + frame-by-frame verification
 * COMPLEXITY: O(n log n) for overlaps + O(f) for frame verification
 */
async function queryInstanceOverlapsInArea(req, reply) {
    try {
        // Get validated parameters from request
        const object = req.query.object;
        const count = parseInt(req.query.count, 10);
        let area = req.query.area;
        
        // Parse area if it's a string
        if (typeof area === 'string') {
            try {
                if (area.startsWith('[')) {
                    area = JSON.parse(area);
                } else {
                    // It's a named area, use the interpretRelativeArea function
                    area = interpretRelativeArea(area);
                    if (!area) {
                        throw new ApiError(`Invalid area description: ${area}`, 400);
                    }
                }
            } catch (e) {
                throw new ApiError(`Invalid area format: ${area}`, 400);
            }
        }

        logger.info(`Processing query for object overlaps in area`, { 
            object, 
            count, 
            area 
        });

        // Instead of making an HTTP call, directly call the function
        // Create a mock request object with the required parameters
        const mockReq = {
            query: {
                object,
                count
            }
        };
        
        // Create a mock reply object to capture the response
        const mockReply = {
            code: () => mockReply,
            send: (data) => data
        };
        
        // Call the function directly
        const overlapsResponse = await queryInstanceOverlaps(mockReq, mockReply);
        const overlaps = overlapsResponse[object];

        logger.debug(`Overlaps fetched for ${object}`, { 
            overlapsCount: overlaps.length 
        });

        // Process each video
        const allSuccessIntervals = await Promise.all(overlaps.map(async (video) => {
            const { video_id, merged_overlaps } = video;

            logger.debug(`Processing video ${video_id} for overlaps`);
            
            // Use queryProcessorUtils to call the function
            const successIntervals = await queryProcessorUtils.filterOverlapsForVideo(
                video_id,
                object,
                merged_overlaps,
                count,
                area
            );

            logger.debug(`Found ${successIntervals.length} success intervals for video ${video_id}`);

            return {
                video_id,
                success_intervals: successIntervals,
            };
        }));

        // Log the query result
        logger.query('Instance overlaps in area query completed', {
            object,
            count,
            area,
            resultCount: allSuccessIntervals.reduce((sum, video) => sum + video.success_intervals.length, 0)
        });

        // Send the success intervals as the response
        return reply.send({ success: true, data: allSuccessIntervals });
    } catch (error) {
        logger.error(`Error querying overlaps in area: ${error.message}`, { 
            stack: error.stack 
        });
        
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * QUERY INSTANCES AT SPECIFIC TIME
 * 
 * PURPOSE: Retrieve all instances of an object that exist at a specific moment in time.
 * 
 * USE CASE: "What 'person' instances are visible at exactly 15.5 seconds?"
 * 
 * WHAT IT DOES:
 * 1. Queries database for all instances of the specified object
 * 2. Filters instances where: start_time <= target_time <= end_time
 * 3. Returns matching instance details
 * 
 * INPUT PARAMETERS:
 * - object: Name of object type (e.g., "person", "car")
 * - time: Target timestamp in seconds (e.g., 15.5)
 * 
 * RETURNS:
 * {
 *   object: "person",
 *   time: 15.5,
 *   instances: [
 *     { video_id: "video123", instance_id: "inst1", ... },
 *     { video_id: "video123", instance_id: "inst2", ... }
 *   ]
 * }
 * 
 * ALGORITHM: Linear scan with time interval check
 * COMPLEXITY: O(n) where n = total instances
 */
async function queryInstancesAtTime(req, reply) {
    try {
        // Get validated parameters from request
        const object = req.query.object;
        const time = parseFloat(req.query.time);

        logger.info(`Querying frames for object at specific time`, { 
            object, 
            time: time.toFixed(3) 
        });

        // Use the utility function to fetch the matching frames
        const instances = await queryProcessorUtils.getInstancesByObjectAndTime(object, time);

        // Log the query result
        logger.query('Instances at time query completed', {
            object,
            time,
            instancesFound: instances.length
        });

        // Respond with results directly
        return reply.send({
            object,
            time,
            instances: instances || [],
        });
    } catch (error) {
        logger.error(`Error querying frames at time: ${error.message}`, { 
            stack: error.stack 
        });
        
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * QUERY SPATIAL OBJECTS WITH TEMPORAL CONSTRAINT
 * 
 * PURPOSE: Find when ANY specified object appears in a specific screen area
 * within a given time range.
 * 
 * USE CASE: "Show me when a 'car' appears in the right-half between 10-30 seconds"
 * 
 * WHAT IT DOES:
 * 1. Performs spatial query (finds objects in specified area)
 * 2. Filters results to only include time windows overlapping [start_time, end_time]
 * 3. Clips window boundaries to fit within time range
 * 4. Returns filtered and clipped time windows per object
 * 
 * INPUT PARAMETERS:
 * - objects: Array of object names (e.g., ["car", "truck"])
 * - area: Screen region - named or coordinates [x1,y1,x2,y2]
 * - start_time: Start of time range in seconds
 * - end_time: End of time range in seconds
 * 
 * RETURNS:
 * [
 *   {
 *     video_id: "video123",
 *     object_name: "car",
 *     windows: [
 *       {
 *         start_time: "00:00:12.000",  // Clipped to time range
 *         end_time: "00:00:25.500"
 *       }
 *     ]
 *   }
 * ]
 * 
 * ALGORITHM: Spatial filtering + temporal window intersection and clipping
 * COMPLEXITY: O(n × f) where n=objects, f=frames, plus O(w) for window filtering
 */
async function querySpatialObjectsTemporal(req, reply) {
    try {
        // Get validated parameters from request
        let objects = req.query.objects;
        let area = req.query.area;
        const startTime = parseFloat(req.query.start_time);
        const endTime = parseFloat(req.query.end_time);

        // Parse objects if it's a string
        if (typeof objects === 'string') {
            try {
                objects = JSON.parse(objects);
            } catch (e) {
                // If JSON parsing fails, try to handle it as a single object
                if (objects.startsWith('[') && objects.endsWith(']')) {
                    // It's likely a malformed JSON array, throw an error
                    throw new ApiError(`Invalid objects format: ${objects}`, 400);
                } else {
                    // Treat it as a single object
                    objects = [objects];
                }
            }
        }

        // Ensure objects is an array
        if (!Array.isArray(objects)) {
            objects = [objects];
        }

        // Parse area if it's a string
        if (typeof area === 'string') {
            try {
                if (area.startsWith('[')) {
                    area = JSON.parse(area);
                } else {
                    // It's a named area, use the interpretRelativeArea function
                    area = interpretRelativeArea(area);
                    if (!area) {
                        throw new ApiError(`Invalid area description: ${area}`, 400);
                    }
                }
            } catch (e) {
                throw new ApiError(`Invalid area format: ${area}`, 400);
            }
        }

        logger.info(`Processing spatial objects temporal query`, { 
            objects, 
            area, 
            startTime, 
            endTime 
        });

        // Step 1: Call the existing `querySpatialObjects` function
        const spatialResults = await queryProcessorUtils.querySpatialObjects({ objects, area });

        logger.debug(`Spatial query returned ${spatialResults.length} results, applying temporal filter`);

        // Step 2: Apply temporal filtering
        const temporalFilteredResults = spatialResults.map((entry) => {
            const filteredWindows = entry.windows
                .map((window) => {
                    // Convert the window times to seconds for comparison
                    const windowStart = convertTimeToSeconds(window.start_time);
                    const windowEnd = convertTimeToSeconds(window.end_time);

                    // Check for overlap with the temporal range
                    if (windowStart < endTime && windowEnd > startTime) {
                        return {
                            start_time: secondsToTime(Math.max(windowStart, startTime)), // Trim start
                            end_time: secondsToTime(Math.min(windowEnd, endTime)), // Trim end
                        };
                    }
                    return null; // No overlap
                })
                .filter((window) => window !== null); // Remove non-overlapping windows

            return {
                ...entry,
                windows: filteredWindows,
            };
        }).filter((entry) => entry.windows.length > 0); // Remove entries with no valid windows

        // Log the query result
        logger.query('Spatial objects temporal query completed', {
            objects,
            area,
            startTime,
            endTime,
            resultCount: temporalFilteredResults.length,
            totalWindows: temporalFilteredResults.reduce((sum, entry) => sum + entry.windows.length, 0)
        });

        // Step 3: Return the filtered results
        return reply.send(temporalFilteredResults);
    } catch (error) {
        logger.error(`Error in querySpatialObjectsTemporal: ${error.message}`, { 
            stack: error.stack 
        });
        
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * QUERY VIDEOS WHERE OBJECTS APPEAR TOGETHER
 * 
 * PURPOSE: Find time windows in videos where ALL specified objects appear simultaneously
 * (anywhere in the frame - no spatial constraint).
 * 
 * USE CASE: "Show me video segments where 'person', 'car', and 'dog' all appear together"
 * 
 * WHAT IT DOES:
 * 1. Fetches all instances of each specified object
 * 2. Groups instances by video_id
 * 3. For each video:
 *    a. Checks that ALL objects appear at some point
 *    b. Finds time periods where ALL objects' instances overlap
 *    c. Computes intersection: max(all starts) to min(all ends)
 * 4. Optionally filters by maximum window_size
 * 5. Merges overlapping result windows
 * 
 * INPUT PARAMETERS:
 * - objects: Array of object names (e.g., ["person", "car", "dog"])
 * - window_size: (Optional) Maximum duration of returned windows in seconds
 * 
 * RETURNS:
 * [
 *   {
 *     video_id: "video123",
 *     windows: [
 *       {
 *         start_time: 5.0,
 *         end_time: 15.3
 *       }
 *     ]
 *   }
 * ]
 * 
 * ALGORITHM: Time window intersection with optional size filtering
 * COMPLEXITY: O(n × m) where n=videos, m=average instances per object
 * 
 * NOTE: This checks temporal overlap only. For spatial constraints,
 * use querySpatialObjectsAnd instead.
 */
async function queryVideos(req, reply) {
    try {
        // Get validated parameters from request
        let objects = req.query.objects;
        const windowSize = req.query.window_size ? parseInt(req.query.window_size, 10) : undefined;

        // Parse objects if it's a string
        if (typeof objects === 'string') {
            objects = JSON.parse(objects);
        }

        logger.info(`Querying videos for objects appearing together`, {
            objects,
            windowSize
        });

        // Call the utility function to get results
        const results = await queryProcessorUtils.queryObjects(objects, windowSize);

        // Log the query result
        logger.query('Video objects query completed', {
            objects,
            windowSize,
            resultCount: results.length
        });

        return reply.send(results);
    } catch (error) {
        logger.error(`Error querying videos: ${error.message}`, {
            stack: error.stack
        });

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * QUERY SPATIAL OBJECTS (OR LOGIC)
 * 
 * PURPOSE: Find time windows when ANY of the specified objects appear in a specific screen area.
 * 
 * USE CASE: "Show me when a 'person' OR a 'dog' appears in the top-left quadrant"
 * 
 * WHAT IT DOES:
 * 1. For EACH object independently:
 *    a. Checks every frame's position data
 *    b. Marks timestamps where object's bounding box intersects with specified area
 *    c. Groups consecutive timestamps into continuous time windows
 * 2. Merges overlapping windows for each object
 * 3. Returns separate results per object per video
 * 
 * INPUT PARAMETERS:
 * - objects: Array of object names (e.g., ["person", "dog"])
 * - area: Screen region - named (e.g., "top-left") or coordinates [x1,y1,x2,y2]
 *   
 *   Named areas: "top-half", "bottom-half", "left-half", "right-half",
 *                "top-left", "top-right", "bottom-left", "bottom-right", etc.
 *   
 *   Coordinates: [x1, y1, x2, y2] where values are 0.0-1.0 (relative to frame size)
 *                Example: [0.0, 0.0, 0.5, 0.5] = top-left quarter
 * 
 * RETURNS:
 * [
 *   {
 *     video_id: "video123",
 *     object_name: "person",
 *     windows: [
 *       {
 *         start_time: "00:00:05.000",
 *         end_time: "00:00:15.300"
 *       }
 *     ]
 *   },
 *   {
 *     video_id: "video123",
 *     object_name: "dog",
 *     windows: [...]
 *   }
 * ]
 * 
 * ALGORITHM: Frame-by-frame spatial filtering with window merging
 * COMPLEXITY: O(n × f) where n=number of objects, f=number of frames
 */
async function querySpatialObjects(req, reply) {
    try {
        // Get validated parameters from request
        let objects = req.query.objects;
        let area = req.query.area;

        // Parse objects if it's a string
        if (typeof objects === 'string') {
            try {
                objects = JSON.parse(objects);
            } catch (e) {
                // If JSON parsing fails, try to handle it as a single object
                if (objects.startsWith('[') && objects.endsWith(']')) {
                    // It's likely a malformed JSON array, throw an error
                    throw new ApiError(`Invalid objects format: ${objects}`, 400);
                } else {
                    // Treat it as a single object
                    objects = [objects];
                }
            }
        }

        // Ensure objects is an array
        if (!Array.isArray(objects)) {
            objects = [objects];
        }

        // Parse area if it's a string
        if (typeof area === 'string') {
            try {
                if (area.startsWith('[')) {
                    area = JSON.parse(area);
                } else {
                    // It's a named area, use the interpretRelativeArea function
                    area = interpretRelativeArea(area);
                    if (!area) {
                        throw new ApiError(`Invalid area description: ${area}`, 400);
                    }
                }
            } catch (e) {
                throw new ApiError(`Invalid area format: ${area}`, 400);
            }
        }

        logger.info(`Querying spatial objects`, {
            objects,
            area
        });

        // Call the utility function to get results
        const result = await queryProcessorUtils.querySpatialObjects({
            objects,
            area,
        });

        // Log the query result
        logger.query('Spatial objects query completed', {
            objects,
            area,
            resultCount: result.length
        });

        return reply.send(result);
    } catch (error) {
        logger.error(`Error querying spatial objects: ${error.message}`, {
            stack: error.stack
        });

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * QUERY SPATIAL OBJECTS (AND LOGIC)
 * 
 * PURPOSE: Find time windows when ALL specified objects appear TOGETHER in a specific screen area.
 * 
 * USE CASE: "Show me when BOTH a 'person' AND a 'dog' are in the bottom-right corner simultaneously"
 * 
 * WHAT IT DOES:
 * 1. Calls querySpatialObjects to get time windows for EACH object in the area
 * 2. Groups results by video_id
 * 3. For each video:
 *    a. Checks if ALL objects have at least one window
 *    b. Computes TIME INTERSECTION of all object windows
 *    c. Only returns periods where ALL objects are present in area simultaneously
 * 4. Returns videos where all criteria met
 * 
 * INPUT PARAMETERS:
 * - objects: Array of object names (e.g., ["person", "dog"]) - ALL must be present
 * - area: Screen region - named or coordinates [x1,y1,x2,y2]
 * 
 * RETURNS:
 * [
 *   {
 *     video_id: "video123",
 *     objects: [
 *       {
 *         object_names: ["person", "dog"],
 *         windows: [
 *           {
 *             start_time: "00:00:10.000",  // Both objects present here
 *             end_time: "00:00:12.500"
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * ]
 * 
 * ALGORITHM: Spatial filtering + time window intersection (multi-video aware)
 * COMPLEXITY: O(n × f) for spatial + O(w²) for intersection where w=windows
 * 
 * NOTE: This is stricter than querySpatialObjects - ALL objects must be present,
 * not just ANY. Returns empty if any object is missing from the area.
 */
async function querySpatialObjectsAnd(req, reply) {
    try {
        // Get validated parameters from request
        let objects = req.query.objects;
        let area = req.query.area;

        // Parse objects if it's a string
        if (typeof objects === 'string') {
            try {
                objects = JSON.parse(objects);
            } catch (e) {
                // If JSON parsing fails, try to handle it as a single object
                if (objects.startsWith('[') && objects.endsWith(']')) {
                    // It's likely a malformed JSON array, throw an error
                    throw new ApiError(`Invalid objects format: ${objects}`, 400);
                } else {
                    // Treat it as a single object
                    objects = [objects];
                }
            }
        }

        // Ensure objects is an array
        if (!Array.isArray(objects)) {
            objects = [objects];
        }

        // Parse area if it's a string
        if (typeof area === 'string') {
            try {
                if (area.startsWith('[')) {
                    area = JSON.parse(area);
                } else {
                    // It's a named area, use the interpretRelativeArea function
                    area = interpretRelativeArea(area);
                    if (!area) {
                        throw new ApiError(`Invalid area description: ${area}`, 400);
                    }
                }
            } catch (e) {
                throw new ApiError(`Invalid area format: ${area}`, 400);
            }
        }

        logger.info(`Querying spatial objects with AND logic`, {
            objects,
            area
        });

        // Call the utility function to get results
        const result = await queryProcessorUtils.querySpatialObjectsAnd({ objects, area });

        // Log the query result
        logger.query('Spatial objects AND query completed', {
            objects,
            area,
            resultCount: result.length
        });

        return reply.send(result);
    } catch (error) {
        logger.error(`Error querying spatial objects (AND): ${error.message}`, {
            stack: error.stack
        });

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * QUERY DISTINCT INSTANCES
 * 
 * PURPOSE: Retrieve all distinct occurrences (instances) of a specific object across all videos.
 * 
 * USE CASE: "Give me a list of all 'person' appearances with their time ranges"
 * 
 * WHAT IT DOES:
 * 1. Queries database for ALL instances of the specified object
 * 2. Returns complete instance information including:
 *    - Instance ID
 *    - Video ID
 *    - Start and end timestamps
 *    - Frame-level position data
 * 3. Each instance represents one continuous appearance of the object
 * 
 * INPUT PARAMETERS:
 * - object: Name of object type to retrieve (e.g., "person", "car")
 * 
 * RETURNS:
 * {
 *   "person": [
 *     {
 *       "_id": "instance_id_1",
 *       "video_id": "video123",
 *       "object_name": "person",
 *       "start_time": 5.0,
 *       "end_time": 15.0,
 *       "frames": [...]
 *     },
 *     {...}
 *   ]
 * }
 * 
 * ALGORITHM: Direct database query with projection
 * COMPLEXITY: O(n) where n=number of instances
 * 
 * USE CASES: Frequency analysis, object distribution, training data collection
 */
async function queryInstances(req, reply) {
    try {
        // Get validated parameters from request
        const object = req.query.object;

        logger.info(`Querying distinct instances for object`, {
            object
        });

        // Call the utility function to get results
        const result = await queryProcessorUtils.getInstanceData([object]);

        // Check if any instances were found
        if (result.length === 0) {
            logger.warn(`No instances found for object: ${object}`);
            return reply.code(404).send({ error: `No instances found for object: ${object}` });
        }

        // Log the query result
        logger.query('Distinct instances query completed', {
            object,
            instanceCount: result.length
        });

        return reply.send({ [object]: result });
    } catch (error) {
        logger.error(`Error querying instances: ${error.message}`, {
            stack: error.stack
        });

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * QUERY INSTANCE OVERLAPS
 * 
 * PURPOSE: Find time periods when N or more instances of the SAME object
 * appear simultaneously in the video (anywhere on screen).
 * 
 * USE CASE: "Show me when at least 3 people are visible at the same time"
 * 
 * WHAT IT DOES:
 * 1. Fetches all instances of the specified object
 * 2. Uses sweep-line algorithm to find overlaps:
 *    a. Creates events for each instance start/end
 *    b. Sorts events by timestamp
 *    c. Sweeps through, tracking active instances
 *    d. When active count >= threshold, records overlap period
 * 3. Merges overlapping result periods
 * 4. Groups results by video_id
 * 
 * INPUT PARAMETERS:
 * - object: Name of object type (e.g., "person", "car")
 * - count: Minimum number of simultaneous instances required (integer >= 2)
 * 
 * RETURNS:
 * {
 *   "person": [
 *     {
 *       "video_id": "video123",
 *       "merged_overlaps": [
 *         {
 *           "start_time": 10.5,
 *           "end_time": 15.8
 *         }
 *       ]
 *     }
 *   ]
 * }
 * 
 * ALGORITHM: Sweep-line algorithm with event-based processing
 * COMPLEXITY: O(n log n) where n=number of instances (optimal)
 * 
 * USE CASES: Crowd detection, traffic density, multi-player scenarios
 * 
 * NOTE: This checks only temporal overlap. For spatial constraints,
 * use queryInstanceOverlapsInArea instead.
 */
async function queryInstanceOverlaps(req, reply) {
    try {
        // Get validated parameters from request
        const object = req.query.object;
        const count = parseInt(req.query.count, 10);

        logger.info(`Querying instance overlaps for object`, {
            object,
            count
        });

        // Fetch all distinct instances of the object
        const instances = await queryProcessorUtils.getInstanceData([object]);

        logger.debug(`Found ${instances.length} instances for object: ${object}`);

        // Step 1: Find overlaps using findInstanceOverlaps
        const overlaps = queryProcessorUtils.findInstanceOverlaps(instances, count);

        // Step 2: Merge overlaps using mergeOverlappingIntervals
        const mergedOverlaps = queryProcessorUtils.mergeOverlappingIntervals(overlaps);

        // Log the query result
        logger.query('Instance overlaps query completed', {
            object,
            count,
            overlapsCount: overlaps.length,
            mergedOverlapsCount: mergedOverlaps.length
        });

        // Return the final merged overlaps
        return reply.send({ [object]: mergedOverlaps });
    } catch (error) {
        logger.error(`Error querying instance overlaps: ${error.message}`, {
            stack: error.stack
        });

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * Get video chunks based on time windows
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function getVideoChunks(req, reply) {
    try {
        // Get validated parameters from request
        const videos = req.body.videos;

        logger.info(`Processing request for video chunks`, {
            videoCount: videos.length
        });

        // Process each video to get chunks
        const response = await Promise.all(videos.map(async (video) => {
            logger.debug(`Getting chunks for video: ${video.video_id}`);
            const result = await queryProcessorUtils.getVideoChunk(video.video_id, video.windows);
            return result || null;
        }));

        // Filter out null results
        const filteredResponse = response.filter(result => result !== null);

        // Log the query result
        logger.query('Video chunks query completed', {
            requestedVideos: videos.length,
            successfulChunks: filteredResponse.length
        });

        return reply.send(filteredResponse);
    } catch (error) {
        logger.error(`Error getting video chunks: ${error.message}`, {
            stack: error.stack
        });

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * Download a specific video chunk
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function downloadVideoChunk(req, reply) {
    try {
        // Get validated parameters from request
        const chunkId = req.params.chunk_id;

        logger.info(`Processing request to download chunk: ${chunkId}`);

        // Fetch the chunk metadata from GridFS
        const file = await queryProcessorUtils.getChunk(chunkId);
        if (!file) {
            throw new ApiError(`Chunk not found: ${chunkId}`, 404);
        }

        // Set headers for downloading the file
        reply.header('Content-Disposition', `attachment; filename="${path.basename(file.filename)}"`);
        reply.type('application/octet-stream'); // Generic binary file type

        logger.debug(`Starting streaming download for file: ${file.filename}`);

        // Stream the file directly from GridFS to the client
        const downloadStream = await queryProcessorUtils.downloadFileAsStream(file._id);

        // Log the download
        logger.query('Video chunk download initiated', {
            chunkId,
            filename: file.filename,
            fileSize: file.length
        });

        // Pipe the file stream into the response
        return reply.send(downloadStream);
    } catch (error) {
        logger.error(`Error downloading video chunk: ${error.message}`, {
            stack: error.stack
        });

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

/**
 * QUERY SEQUENCE
 * 
 * PURPOSE: Find video segments where objects appear in a specific sequential order.
 * 
 * USE CASE: "Show me when a 'person' appears, THEN a 'car', THEN a 'dog' in that order"
 * 
 * WHAT IT DOES:
 * 1. Fetches all instances of each object in the sequence
 * 2. Sorts instances by start_time within each video
 * 3. For each video, attempts to match the sequence:
 *    a. For each instance of first object
 *    b. Find CLOSEST instance of second object that starts AFTER first ends
 *    c. Continue for all objects in sequence
 *    d. Track total time span from first start to last end
 * 4. Filters sequences by window_size if specified
 * 5. Returns matched sequences with time spans
 * 
 * INPUT PARAMETERS:
 * - sequence: Array of object names IN ORDER (e.g., ["person", "car", "dog"])
 * - window_size: (Optional) Maximum duration of entire sequence in seconds
 * 
 * RETURNS:
 * [
 *   {
 *     "video_id": "video123",
 *     "windows": [
 *       {
 *         "start_time": "00:00:05.000",  // First object starts
 *         "end_time": "00:00:18.500"     // Last object ends
 *       }
 *     ]
 *   }
 * ]
 * 
 * ALGORITHM: Greedy closest-match sequential search
 * COMPLEXITY: O(n × m) where n=videos, m=sequence length × avg instances
 * 
 * ORDERING RULES:
 * - Each next object must START after the previous object ENDS
 * - Selects the CLOSEST matching instance (minimum time gap)
 * - Overlapping instances are NOT allowed in sequence
 * 
 * USE CASES: Behavioral analysis, activity detection, story extraction
 * 
 * EXAMPLES:
 * - Sports: "Player runs, then ball flies, then goal scored"
 * - Traffic: "Car approaches, stops, then person exits"
 * - Wildlife: "Animal appears, eats, then leaves"
 */
async function querySequence(req, reply) {
    try {
        // Get validated parameters from request
        let sequence = req.query.sequence;
        const windowSize = req.query.window_size ? parseInt(req.query.window_size, 10) : 0;

        // Parse sequence if it's a string
        if (typeof sequence === 'string') {
            try {
                sequence = JSON.parse(sequence);
            } catch (e) {
                // If JSON parsing fails, try to handle it as a single object
                if (sequence.startsWith('[') && sequence.endsWith(']')) {
                    // It's likely a malformed JSON array, throw an error
                    throw new ApiError(`Invalid sequence format: ${sequence}`, 400);
                } else {
                    // Treat it as a single object
                    sequence = [sequence];
                }
            }
        }

        // Ensure sequence is an array
        if (!Array.isArray(sequence)) {
            sequence = [sequence];
        }

        // Validate sequence
        if (sequence.length < 2) {
            throw new ApiError('Sequence must contain at least 2 objects', 400);
        }

        logger.info(`Querying for object sequences`, {
            sequence,
            windowSize
        });

        // Call the utility function to get results
        const result = await queryProcessorUtils.querySequence(sequence, windowSize);

        // Log the query result
        logger.query('Sequence query completed', {
            sequence,
            windowSize,
            resultCount: result.length
        });

        return reply.send(result);
    } catch (error) {
        logger.error(`Error querying sequence of objects: ${error.message}`, {
            stack: error.stack
        });

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(500).send({ error: "Internal Server Error" });
    }
}

// Export all query handlers
export {
    queryInstanceOverlapsInArea,
    queryInstancesAtTime,
    querySpatialObjectsTemporal,
    queryVideos,
    querySpatialObjects,
    querySpatialObjectsAnd,
    queryInstances,
    queryInstanceOverlaps,
    getVideoChunks,
    downloadVideoChunk,
    querySequence
};

export default {
    queryInstanceOverlapsInArea,
    queryInstancesAtTime,
    querySpatialObjectsTemporal,
    queryVideos,
    querySpatialObjects,
    querySpatialObjectsAnd,
    queryInstances,
    queryInstanceOverlaps,
    getVideoChunks,
    downloadVideoChunk,
    querySequence
};