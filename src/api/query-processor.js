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
        let objects = req.params.objects;
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
    downloadVideoChunks: async (req, reply) => {
        let videos = req.body.videos;
        for (let i = 0; i < videos.length; i++) {
            let video = videos[i];
            let videoId = video.video_id;
            let startTime = video.start_time;
            let endTime = video.end_time;
            await queryProcessorUtils.downloadVideoChunk(videoId, startTime, endTime);
        }
    }
}