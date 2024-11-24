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
    }
}