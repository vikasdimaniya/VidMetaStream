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
        query["$and"] = [
            {
                "start_time": { "$lte": endTime } // The document's start_time must be less than or equal to the window's end
            },
            {
                "end_time": { "$gte": startTime }       // The document's end_time must be greater than or equal to the window's start
            }
        ]
        let results = await db.objects.find(query);
        return results;
    },
    queryVideos: async (object) => {
        let query = {};
        query.object_name = object;
        let results = await db.objects.find(query);
        return results;
    },
    getVideoFilesForTimeWindows: async (queryWindows) => {
        const results = [];

        for (const queryWindow of queryWindows) {
            const { video_id, windows } = queryWindow;

            for (const window of windows) {
                const { startTime, endTime } = window;

                // MongoDB query to find overlapping files
                const matchingFiles = await db.collection('fs.files').find({
                    'metadata.videoID': video_id,
                    $and: [
                        { 'metadata.startTimestamp': { $lt: endTime } }, // File starts before query ends
                        { 'metadata.endTimestamp': { $gt: startTime } }  // File ends after query starts
                    ]
                }).toArray();

                // Append matching files to results
                results.push(...matchingFiles);
            }
        }

        return results; // Return all matching files
    }
};