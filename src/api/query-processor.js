const queryProcessorUtils = require('../utils/query-processor.js');

module.exports = {
    /**
     * 
     * @param {*} req 
     * @param {*} reply 
     * @returns list of video sections where all the objects are seen together 
     * [{video_id:2, start_time: 0, end_time: 10}, {video_id:2, start_time: 15, end_time: 20}, {video_id:3, start_time: 0, end_time: 10}]
     */
    queryVideos: async (req, reply) => {
        let objects = req.body.objects;
        let results = await queryProcessorUtils.queryObjects(objects);
        return reply.send(results);
    },
    downloadVideoChunks: async (req, reply) => {
        let sections = req.body.sections;
    }
}