'use strict';
module.exports = {
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
    }
}