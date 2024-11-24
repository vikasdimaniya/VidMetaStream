const db = require('../db');

module.exports = {
    queryVideosWithInSpecificTime: async (videoIds, objects, startTime, endTime) => {
        let query = {}
        if (!videoIds) {
            // search in all videos, this should never happen
        } else {
            query.video_id = { $in: videoIds };
        }
        query.object_name = { $in: objects };
        query.start_time = { $gte: startTime, $lte: endTime };
        return;
    },
    queryVideos: async (objects) => {
        let query = {};
        query.object_name = { $in: objects };
        let results = await db.objects.find(query);
        return results;
    }
};