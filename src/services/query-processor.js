const db = require('../db');

module.exports = {
    queryVideosWithInSpecificTime: async (videoId, object, startTime, endTime) => {
        let window = {
            startTime: startTime,
            endTime: endTime
        }
        let query = {}
        query.video_id = videoId;
        query.object_name = object;
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