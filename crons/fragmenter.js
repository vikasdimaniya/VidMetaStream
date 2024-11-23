// This script connects to MongoDB using GridFS and continuously checks for new videos in the database every 2 seconds. 
// Videos marked as 'analyzed' are updated to 'fragmenting' and split into 5-second chunks using FFmpeg.
// The fragmented video chunks are stored in GridFS, and the video status is updated to 'fragmented' after completion.
// Temporary files are cleaned up after successful storage to optimize disk usage.

'use strict';

const core = require('./../core.js');
const db = require('../src/db');
const ffmpegUtils = require('../src/utils/ffmpeg.js');
const chunkStorage = require('../src/services/chunkStorage');
const fs = require('fs');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
let gridFSBucket;
async function start() {
    await core.initMongo(); // Initialize MongoDB and GridFS
    gridFSBucket = core.getGridFSBucket();
    while (true) {
        let video = await db.video.findOneAndUpdate({ status: 'analized' }, { status: 'fragmenting' }, { new: true });
        if (!video) {
            console.log("No videos to fragment");
            await sleep(2000);
            continue;
        }
        console.log('Fragmenting video:', video._id);
        console.log(video);
        if (!video.uploadTempLocation) {
            console.log('Video has no upload location');
            // Update video status to 'failed'
            video.status = 'error';
            video.error = {code: 'no_upload_location', message: 'Video had no upload location, while fragmenting.'};
            await video.save();
            continue;
        }
        const inputFilePath = video.uploadTempLocation; // Path to the input video file
        const outputDir = 'temp/fragmented/' + video._id + "/"; // Path to output directory for chunks

        // Split video into 5-second chunks
        await ffmpegUtils.splitVideoIntoChunks(inputFilePath, outputDir);

        // Update video status to 'fragmented'
        video.status = 'fragmented';
        await video.save();

        // store the fragmented files in gridfs
        //await storeInGridFS(outputDir);
        let x = await chunkStorage.uploadAllFilesToGridfs(gridFSBucket, outputDir);
        console.log(x);
        try {
            fs.rmdirSync(outputDir, { recursive: true });
            fs.unlinkSync(inputFilePath);
        } catch (error) {
            console.error('Error deleting files:', error);
        }
        video.status = 'ready';
        await video.save();
    }
}

start();