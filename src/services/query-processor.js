const { getDb } = require('../../core'); // Adjust path if necessary

const getInstanceData = async (objects) => {
    try {
        const db = getDb();
        if (!db) {
            throw new Error('Database not initialized');
        }

        console.log("Objects to query for:", objects);

        const results = await db.collection('objects').find({
            object_name: { $in: objects },
        }).toArray();

        if (!results || results.length === 0) {
            console.log("No results found for objects:", objects);
            return [];
        }

        const transformedResults = results.map((result) => ({
            _id: result._id,
            video_id: result.video_id,
            object_name: result.object_name,
            start_time: result.start_time,
            end_time: result.end_time,
        }));

        console.log("Transformed results:", transformedResults);

        return transformedResults;
    } catch (error) {
        console.error("Error in getInstanceData:", error);
        throw error;
    }
};

module.exports = {
    queryVideosWithInSpecificTime: async (videoId, object, startTime, endTime) => {
        const db = getDb();
        if (!db) {
            throw new Error('Database not initialized');
        }

        const query = {
            video_id: videoId,
            object_name: object,
            "$and": [
                { "start_time": { "$lte": endTime } },
                { "end_time": { "$gte": startTime } },
            ],
        };

        const results = await db.collection('objects').find(query).toArray();
        return results;
    },
    queryVideos: async (object) => {
        const db = getDb();
        if (!db) {
            throw new Error('Database not initialized');
        }

        const query = { object_name: object };
        const results = await db.collection('objects').find(query).toArray();
        return results;
    },

    getVideoFilesForTimeWindows: async (queryWindows) => {
        const db = getDb();
        if (!db) {
            throw new Error('Database not initialized');
        }

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
    },
    getObjectData: async (objects) => {
        const db = getDb();
        if (!db) {
            throw new Error('Database not initialized');
        }
        try {
            // Log the query to debug
            console.log("Querying objects with:", objects);

            // Query the 'objects-decimal' model for specified object names
            const results = await db.objects.find({ object_name: { $in: objects } });

            // Log the raw results
            console.log("Query results:", results);

            // Transform the results to the desired structure
            const transformedResults = results.map((result) => ({
                video_id: result.video_id,
                object_name: result.object_name,
                frames: result.frames || [], // Ensure frames are included, default to an empty array
            }));

            // Log the transformed results
            console.log("Transformed results:", transformedResults);

            return transformedResults;
        } catch (error) {
            console.error("Error in getObjectData:", error);
            throw error; // Re-throw the error for higher-level handling
        }
    },

    getInstanceData,
};