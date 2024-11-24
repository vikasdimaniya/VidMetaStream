const queryService = require('../services/query-processor.js');
const timeWindows = require('../utils/time-windows.js');
module.exports = {
    queryObjects: async (objects) => {
        let results = [];
        let firstObjectResult = await queryService.queryVideos(objects[0]);
        for (let result of firstObjectResult) {
            let currentWindows = timeWindows.getTimings(result);
            let previousWindows = currentWindows;
            let currentResult;
            for (let i = 1; i < objects.length; i++) {
                currentResult = await queryService.queryVideosWithInSpecificTime(result.video_id, objects[i], previousWindows.startTime, previousWindows.endTime);
                currentWindows = timeWindows.getTimings(currentResult);
                previousWindows = timeWindows.calculateOverlapingTimings(previousWindows, currentWindows);
            }
            results.push(currentResult);
        }
        return results;
    }
}