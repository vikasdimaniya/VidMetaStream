const queryService = require('../services/query-processor.js');
module.exports = {
    queryObjects: async (objects) => {
        let currentResult = await queryVideos(objects);
        let currentWindows = getTimings(currentResult);
        let previousWindows = currentWindows;
        for (let i = 1; i < objects.length; i++) {
            currentResult = queryService.queryVideosWithInSpecificTime(videoIds, objects[i], previousWindows.startTime, previousWindows.endTime);
            currentWindows = getTimings(currentResult);
            previousWindows = calculateOverlapingTimings(previousWindows, currentWindows);
        }
        return currentResult;
    }
}