// src/api/query-processor
const axios = require('axios'); // Assuming you use axios to make HTTP requests
const queryProcessorUtils = require('../utils/query-processor.js');
const path = require('path');
const fs = require('fs');

// Helper function to define relative regions for spatial queries
const interpretRelativeArea = (region) => {
    const regions = {
        // Halves
        "top-half": [0.0, 0.0, 1.0, 0.5],
        "bottom-half": [0.0, 0.5, 1.0, 1.0],
        "left-half": [0.0, 0.0, 0.5, 1.0],
        "right-half": [0.5, 0.0, 1.0, 1.0],

        // Thirds (horizontal)
        "top-third": [0.0, 0.0, 1.0, 1 / 3],
        "middle-third-horizontal": [0.0, 1 / 3, 1.0, 2 / 3],
        "bottom-third": [0.0, 2 / 3, 1.0, 1.0],

        // Thirds (vertical)
        "left-third": [0.0, 0.0, 1 / 3, 1.0],
        "middle-third-vertical": [1 / 3, 0.0, 2 / 3, 1.0],
        "right-third": [2 / 3, 0.0, 1.0, 1.0],

        // Quadrants
        "top-left": [0.0, 0.0, 0.5, 0.5],
        "top-right": [0.5, 0.0, 1.0, 0.5],
        "bottom-left": [0.0, 0.5, 0.5, 1.0],
        "bottom-right": [0.5, 0.5, 1.0, 1.0],
    };

    return regions[region] || null; // Return null if no match
};

// Validate area input
const validateArea = (area) => {
    if (typeof area === "string") {
        return interpretRelativeArea(area);
    }
    try {
        area = JSON.parse(area);
    } catch {
        throw new Error("Invalid JSON for area");
    }
    if (!Array.isArray(area) || area.length !== 4 || area.some(coord => typeof coord !== "number")) {
        throw new Error("Area must be an array with exactly 4 numerical coordinates");
    }
    return area;
};

const queryInstanceOverlapsInArea = async (req, reply) => {
    let object, count, area;

    try {
        // Parse and validate query parameters
        object = req.query.object;
        count = parseInt(req.query.count, 10);
        area = validateArea(req.query.area);

        if (!object || typeof object !== "string" || isNaN(count) || count < 2 || !area) {
            return reply.code(400).send({ error: "Invalid parameters" });
        }

        console.log(`Parsed Query Parameters -> object: ${object}, count: ${count}, area: ${JSON.stringify(area)}`);
    } catch (err) {
        return reply.code(400).send({ error: "Invalid query parameters" });
    }

    try {
        // Fetch overlaps from `queryInstanceOverlaps`
        const overlapsResponse = await axios.get(
            `http://localhost:8000/query/queryInstanceOverlaps?object=${object}&count=${count}`
        );
        const overlaps = overlapsResponse.data[object];

        console.log(`Overlaps fetched:`, JSON.stringify(overlaps, null, 2));

        // Process each video
        const allSuccessIntervals = [];
        for (const video of overlaps) {
            const { video_id, merged_overlaps } = video;

            console.log(`Calling filterOverlapsForVideo with video_id=${video_id}`);
            // Use queryProcessorUtils to call the function
            const successIntervals = await queryProcessorUtils.filterOverlapsForVideo(
                video_id,
                object,
                merged_overlaps,
                count,
                area
            );

            console.log(`Success intervals for video_id=${video_id}:`, JSON.stringify(successIntervals, null, 2));

            allSuccessIntervals.push({
                video_id,
                success_intervals: successIntervals,
            });
        }

        // Send the success intervals as the response
        return reply.send({ success: true, data: allSuccessIntervals });
    } catch (error) {
        console.error("Error querying overlaps in area:", error);
        return reply.code(500).send({ error: "Internal Server Error" });
    }
};



module.exports = {
    /**
     * 
     * @param {*} req 
     * @param {*} reply 
     * @returns list of video sections where all the objects are seen together 
     * [{video_id:2, start_time: 0, end_time: 10}, {video_id:2, start_time: 15, end_time: 20}, {video_id:3, start_time: 0, end_time: 10}]
     */
    queryVideos: async (req, reply) => {
        let objects = req.query.objects;
        let windowSize = req.query.window_size;
        try {
            objects = JSON.parse(objects);
        } catch (err) {
            return reply.send({ error: "Invalid JSON" });
        }
        let results = await queryProcessorUtils.queryObjects(objects, windowSize);
        return reply.send(results);
    },
    /**
     * 
     * @param {*} req 
     * @param {*} reply 
     * 
     * videos: [
     *  {video_id: 1, timings:[{startTime:1, endtime:2},{startTime:5, endtime:20}]}
     * ]
     * 
     */
    getVideoChunks: async (req, reply) => {
        let response = [];
        let videos = req.body.videos;
        for (let video of videos) {
            let result = await queryProcessorUtils.getVideoChunk(video.video_id, video.windows);
            if (result) {
                response.push(result);
            }
        }
        return reply.send(response);
    },
    downloadVideoChunk: async (req, reply) => {
        const chunkId = req.params.chunk_id;

        // Fetch the chunk metadata from GridFS
        let file = await queryProcessorUtils.getChunk(chunkId);

        // Set headers for downloading the file
        reply.header('Content-Disposition', `attachment; filename="${path.basename(file.filename)}"`);
        reply.type('application/octet-stream'); // Generic binary file type

        console.log(`Starting streaming download for file: ${file.filename}`);

        // Stream the file directly from GridFS to the client
        const downloadStream = await queryProcessorUtils.downloadFileAsStream(file._id);

        // Pipe the file stream into the response
        return reply.send(downloadStream);
    },
    // query video funciton for spatial queries
    querySpatialObjects: async (req, reply) => {
        let objects;
        let area;

        // Parse and validate objects
        try {
            objects = JSON.parse(req.query.objects);
        } catch (err) {
            return reply.send({ error: "Invalid JSON for objects" });
        }

        // Determine the area
        if (typeof req.query.area === "string") {
            area = interpretRelativeArea(req.query.area); // Handle shorthand
            if (!area) {
                return reply.code(400).send({ error: `Invalid area description: ${req.query.area}` });
            }
        } else {
            try {
                area = JSON.parse(req.query.area); // Handle explicit bounding box
            } catch (err) {
                return reply.send({ error: "Invalid JSON for area" });
            }
        }

        // Validate bounding box format
        if (!area || !Array.isArray(area) || area.length !== 4) {
            return reply.code(400).send({ error: "Area must be an array with exactly 4 coordinates [x1, y1, x2, y2]" });
        }

        try {
            // Pass to query processor utils
            const result = await queryProcessorUtils.querySpatialObjects({
                objects,
                area,
            });

            // Return the results
            return reply.send(result);
        } catch (error) {
            console.error("Error querying spatial objects:", error);
            return reply.code(500).send({ error: "Internal Server Error" });
        }
    },
    /**
     * Handles queries for sequences of objects appearing in order.
     * @param {*} req 
     * @param {*} reply 
     * @returns List of video sections where the objects appear in the specified sequence.
     */
    querySequence: async (req, reply) => {
        let sequence;
        let windowSize = parseInt(req.query.window_size) || 0;

        // Parse and validate the sequence
        try {
            sequence = JSON.parse(req.query.sequence);
        } catch (err) {
            return reply.code(400).send({ error: "Invalid JSON for sequence" });
        }

        if (!Array.isArray(sequence) || sequence.length < 2) {
            return reply.code(400).send({ error: "Sequence must be an array of at least two object names" });
        }

        try {
            // Pass to query processor utils
            const result = await queryProcessorUtils.querySequence(sequence, windowSize);
            return reply.send(result);
        } catch (error) {
            console.error("Error querying sequence of objects:", error);
            return reply.code(500).send({ error: "Internal Server Error" });
        }
    },
    // Logical AND: query video function for spatial queries intersection
    querySpatialObjectsAnd: async (req, reply) => {
        let objects;
        let area;

        // Parse and validate objects
        try {
            objects = JSON.parse(req.query.objects);
            if (!objects || !Array.isArray(objects) || objects.length === 0) {
                return reply.code(400).send({ error: "Invalid 'objects': must be a non-empty array" });
            }
        } catch (err) {
            return reply.send({ error: "Invalid JSON for objects" });
        }

        // Parse and validate area
        try {
            area = validateArea(req.query.area);
        } catch (err) {
            return reply.code(400).send({ error: err.message });
        }

        try {
            const result = await queryProcessorUtils.querySpatialObjectsAnd({ objects, area });
            return reply.send(result);
        } catch (error) {
            console.error("Error querying spatial objects (AND):", error);
            return reply.code(500).send({ error: "Internal Server Error" });
        }
    },
    // Gets distinct instances of classes 
    queryInstances: async (req, reply) => {
        let object;
        try {
            object = req.query.object; // Expecting a single object as a string, e.g., "person"
            if (!object || typeof object !== "string") {
                return reply.code(400).send({ error: "Invalid 'object': must be a non-empty string" });
            }
        } catch (err) {
            return reply.send({ error: "Invalid query for object" });
        }

        try {
            console.log("Fetching instances for:", object); // Add this log
            const result = await queryProcessorUtils.getInstanceData([object]);
            if (result.length === 0) {
                return reply.code(404).send({ error: `No instances found for object: ${object}` });
            }
            return reply.send({ [object]: result });
        } catch (error) {
            console.error("Error querying instances:", error);
            return reply.code(500).send({ error: "Internal Server Error" });
        }
    },


    queryInstanceOverlaps: async (req, reply) => {
        let object;
        let count;

        // Parse and validate the object and count
        try {
            object = req.query.object; // Expecting an object type, e.g., "person"
            count = parseInt(req.query.count, 10); // Number of instances to compare for overlap
            if (!object || typeof object !== "string" || isNaN(count) || count < 2) {
                return reply.code(400).send({
                    error: "Invalid 'object' or 'count': must be a string and a number >= 2",
                });
            }
        } catch (err) {
            return reply.code(400).send({ error: "Invalid query parameters" });
        }

        try {
            // Fetch all distinct instances of the object
            const instances = await queryProcessorUtils.getInstanceData([object]);

            // Step 1: Find overlaps using findInstanceOverlaps
            const overlaps = queryProcessorUtils.findInstanceOverlaps(instances, count);

            // Step 2: Merge overlaps using mergeOverlappingIntervals
            const mergedOverlaps = queryProcessorUtils.mergeOverlappingIntervals(overlaps);

            // Return the final merged overlaps
            return reply.send({ [object]: mergedOverlaps });
        } catch (error) {
            console.error("Error querying instance overlaps:", error);
            return reply.code(500).send({ error: "Internal Server Error" });
        }
    },

    queryInstanceOverlapsInArea
}