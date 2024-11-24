const db = require('../db');

module.exports = {
    queryVideosWithInSpecificTime: async (videoIds, objects, startTime, endTime) => {
        let window = {
            startTime: startTime,
            endTime: endTime
        }
        let query = {}
        if (!videoIds) {
            // search in all videos, this should never happen
        } else {
            query.video_id = { $in: videoIds };
        }
        query.object_name = { $in: objects };
        query["$or"] = [
            { 
                "$and": [
                    {startTime: { $gte: window.startTime}},
                    {endTime: {$lte: window.endTime}}
                ]
            },
            { 
                "$and": [
                    {startTime: { $lte: window.startTime}},
                    {endTime: {$lte: window.endTime}}
                ]
            },
            { 
                "$and": [
                    {startTime: { $gte: window.startTime}},
                    {endTime: {$gte: window.endTime}}
                ]
            },
            { 
                "$and": [
                    {startTime: { $lte: window.startTime}},
                    {endTime: {$gte: window.endTime}}
                ]
            },
        ]
        return;
    },
    queryVideos: async (objects) => {
        let query = {};
        query.object_name = { $in: objects };
        let results = await db.objects.find(query);
        return results;
    }
};