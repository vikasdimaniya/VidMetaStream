// src/api/query-processor
const queryProcessorUtils = require('../utils/query-processor.js');
const path = require('path');
const fs = require('fs');

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
        try{
            objects = JSON.parse(objects);
        }catch(err){
            return reply.send({error: "Invalid JSON"});
        }
        let results = await queryProcessorUtils.queryObjects(objects);
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
}
//Helper function to define regions for spatial queries
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
