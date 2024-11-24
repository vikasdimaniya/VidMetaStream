const queryService = require('../services/query-processor.js');
const timeWindows = require('../utils/time-windows.js');
module.exports = {
    queryObjects: async (objects) => {
        let currentResult = await queryService.queryVideos(objects[0]);
        let currentWindows = timeWindows.getTimings(currentResult);
        let previousWindows = currentWindows;
        for (let i = 1; i < objects.length; i++) {
            currentResult = queryService.queryVideosWithInSpecificTime(videoIds, objects[i], previousWindows.startTime, previousWindows.endTime);
            currentWindows = timeWindows.getTimings(currentResult);
            previousWindows = timeWindows.calculateOverlapingTimings(previousWindows, currentWindows);
        }
        return currentResult;
    }
}