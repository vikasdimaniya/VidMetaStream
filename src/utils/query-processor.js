// src/utils/query-processor
const queryService = require('../services/query-processor.js');
const timeWindowsUtils = require('../utils/time-windows.js');
const gridFSStorage = require('../services/chunk-storage.js');
const fs = require('fs');
const core = require('../../core.js');
const path = require('path');
module.exports = {
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
        formattedResults = formattedResults.filter((result) => {
            return result.windows.length >= windowSize;
        });
        return formattedResults; // Return the formatted results
    },
    getVideoChunk: async (videoId, windows) => {
        // Get matching files metadata for the specified time window
        let files = await gridFSStorage.getVideoFilesForTimeWindows(core.getGridFSBucket(), videoId, windows);
        return files;
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

// Helper function to check if a point is within a defined region
const isWithinRegion = (point, region) => {
    const [x1, y1, x2, y2] = region;
    const [x, y] = point;
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
};
