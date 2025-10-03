'use strict';

const timeWindows = {
    getTimings: function (object) {
        return {
            startTime: object.start_time,
            endTime: object.end_time
        }

    },
    calculateOverlapingTimings: function (mainWindow, secondaryWindow) {
        return {
            startTime: Math.max(mainWindow.startTime, secondaryWindow.startTime),
            endTime: Math.min(mainWindow.endTime, secondaryWindow.endTime)
        };
    },
    mergeTimeWindows: (results) => {
        const mergedResults = {};

        for (let videoId of Object.keys(results)) {
            const windows = results[videoId].windows;

            // Sort windows by startTime
            const sortedWindows = windows.sort((a, b) => a.startTime - b.startTime);

            // Merge overlapping or contiguous time windows
            const mergedWindows = [];
            let currentWindow = sortedWindows[0];

            for (let i = 1; i < sortedWindows.length; i++) {
                const nextWindow = sortedWindows[i];

                // Check if the current window overlaps or is contiguous with the next
                if (currentWindow.endTime >= nextWindow.startTime) {
                    // Merge the two windows
                    currentWindow = {
                        startTime: currentWindow.startTime,
                        endTime: Math.max(currentWindow.endTime, nextWindow.endTime),
                    };
                } else {
                    // Push the non-overlapping window and move to the next
                    mergedWindows.push(currentWindow);
                    currentWindow = nextWindow;
                }
            }

            // Add the last window
            if (currentWindow) {
                mergedWindows.push(currentWindow);
            }

            // Store the merged results for this videoId
            mergedResults[videoId] = { windows: mergedWindows };
        }

        return mergedResults;
    },

    /**
     * Checks if a relative position is within a given region.
     * @param {Array} relativePosition - [x, y] coordinates (0 to 1).
     * @param {Array} regionCoordinates - [x1, y1, x2, y2] coordinates (0 to 1).
     * @returns {Boolean} - True if within the region, else false.
     */
    isWithinRegion: function (relativePosition, regionCoordinates) {
        const [x1, y1, x2, y2] = regionCoordinates;
        const [x, y] = relativePosition;
        return x >= x1 && x <= x2 && y >= y1 && y <= y2;
    },

    /**
     * Calculates the duration between two timestamps in seconds.
     * @param {Number} startTime - Start time in seconds.
     * @param {Number} endTime - End time in seconds.
     * @returns {Number} - Duration in seconds.
     */
    calculateDuration: function (startTime, endTime) {
        return endTime - startTime;
    }
};

export default timeWindows;