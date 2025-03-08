// src/api/query-processor
const path = require('path');
const queryProcessorUtils = require('../utils/query-processor.js');
const { ApiError } = require('../utils/errors.js');
const logger = require('../utils/logger.js');
const { 
    interpretRelativeArea, 
    validateArea, 
    convertTimeToSeconds, 
    secondsToTime 
} = require('../utils/spatial-utils.js');

/**
 * Query for instances of objects that overlap in a specific area
 */
async function queryInstanceOverlapsInArea(req, reply) {
    try {
        // Get validated parameters from request
        const object = req.query.object;
        const count = parseInt(req.query.count, 10);
        const area = req.query.area;
        
        // Parse area if it's a JSON string
        let parsedArea = area;
        if (typeof area === 'string') {
            if (area.startsWith('[')) {
                parsedArea = JSON.parse(area);
            } else {
                // It's a named area, use the interpretRelativeArea function
                parsedArea = interpretRelativeArea(area);
                if (!parsedArea) {
                    throw new ApiError(`Invalid area description: ${area}`, 400);
                }
            }
        }

        logger.info(`Processing query for object overlaps in area`, { 
            object, 
            count, 
            area: parsedArea 
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
                parsedArea
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
            area: parsedArea,
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
 * Query for instances of objects at a specific time
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
 * Query for objects in a specific area during a time range
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
            objects = JSON.parse(objects);
        }

        // Parse area if it's a string
        if (typeof area === 'string') {
            if (area.startsWith('[')) {
                area = JSON.parse(area);
            } else {
                // It's a named area, use the interpretRelativeArea function
                area = interpretRelativeArea(area);
                if (!area) {
                    throw new ApiError(`Invalid area description: ${area}`, 400);
                }
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
 * Query videos for objects appearing together
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 * @returns {Array} - List of video sections where all the objects are seen together
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
 * Query for objects in specific areas
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function querySpatialObjects(req, reply) {
    try {
        // Get validated parameters from request
        let objects = req.query.objects;
        let area = req.query.area;

        // Parse objects if it's a string
        if (typeof objects === 'string') {
            objects = JSON.parse(objects);
        }

        // Parse area if it's a string
        if (typeof area === 'string') {
            if (area.startsWith('[')) {
                area = JSON.parse(area);
            } else {
                // It's a named area, use the interpretRelativeArea function
                area = interpretRelativeArea(area);
                if (!area) {
                    throw new ApiError(`Invalid area description: ${area}`, 400);
                }
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
 * Query for objects that satisfy multiple spatial conditions (AND)
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function querySpatialObjectsAnd(req, reply) {
    try {
        // Get validated parameters from request
        let objects = req.query.objects;
        let area = req.query.area;

        // Parse objects if it's a string
        if (typeof objects === 'string') {
            objects = JSON.parse(objects);
        }

        // Parse area if it's a string
        if (typeof area === 'string') {
            if (area.startsWith('[')) {
                area = JSON.parse(area);
            } else {
                // It's a named area, use the interpretRelativeArea function
                area = interpretRelativeArea(area);
                if (!area) {
                    throw new ApiError(`Invalid area description: ${area}`, 400);
                }
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
 * Query for distinct instances of objects
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
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
 * Query for overlaps of the same object class
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
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
 * Query for sequences of objects appearing in order
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function querySequence(req, reply) {
    try {
        // Get validated parameters from request
        let sequence = req.query.sequence;
        const windowSize = req.query.window_size ? parseInt(req.query.window_size, 10) : 0;

        // Parse sequence if it's a string
        if (typeof sequence === 'string') {
            sequence = JSON.parse(sequence);
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
module.exports = {
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