const queryService = require('../services/query-processor.js');
const timeWindowsUtils = require('../utils/time-windows.js');
module.exports = {
    queryObjects: async (objects) => {
        let results = [];
        let firstObjectResult = await queryService.queryVideos(objects[0]);
        for (let result of firstObjectResult) {
            let firstParentWindow = timeWindowsUtils.getTimings(result);
            let parentWindows = [firstParentWindow];
            for (let i = 1; i < objects.length; i++) {
                let currentObjectResults = [];
                for (let window of parentWindows) {
                    let overlappingWindows = await queryService.queryVideosWithInSpecificTime(result.video_id, objects[i], window.startTime, window.endTime);
                    // if (overlappingWindows) {
                    //     currentObjectResults = [...currentObjectResults, ...overlappingWindows];
                    // }
                    for (let mini of overlappingWindows) {
                        let currentWindow = timeWindowsUtils.getTimings(mini);
                        let newWindow = timeWindowsUtils.calculateOverlapingTimings(currentWindow, firstParentWindow);
                        currentObjectResults.push(newWindow);
                    }
                }
                parentWindows = currentObjectResults;
            }
            if (parentWindows.length > 0){
                results.push({video_id: result.video_id, windows: parentWindows});
            }
        }
        return results;
    }
}