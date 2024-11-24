module.exports = {
    getTimings: function (object) {
        return {
            startTime: object.startTime,
            endTime: object.endTime
        }

    },
    calculateOverlapingTimings: function (mainWindow, secondaryWindow) {
        return {
            startTime: max(mainWindow.startTime, secondaryWindow.startTime),
            endTime: min(mainWindow.endTime, secondaryWindow.endTime)
        };
    }
}