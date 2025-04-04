// This script connects to MongoDB using GridFS and continuously checks for new videos in the database every 2 seconds. 
// Videos marked as 'analyzed' are updated to 'fragmenting' and split into 5-second chunks using FFmpeg.
// The fragmented video chunks are stored in GridFS, and the video status is updated to 'fragmented' after completion.
// Temporary files are cleaned up after successful storage to optimize disk usage.

'use strict';

import core from '../core.js';
import db from '../src/db/index.js';
import ffmpegUtils from '../src/utils/ffmpeg.js';
import * as chunkStorage from '../src/services/chunk-storage.js';
import fs from 'fs';
import { s3Service } from '../src/services/s3.js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
let gridFSBucket;
async function start() {
    await core.initMongo(); // Initialize MongoDB and GridFS
    gridFSBucket = core.getGridFSBucket();
    while (true) {
        let video = await db.videos.findOneAndUpdate({ status: 'analyzed' }, { status: 'fragmenting' }, { new: true });
        if (!video) {
            console.log("No videos to fragment");
            await sleep(2000);
            continue;
        }
        console.log('Fragmenting video:', video._id);
        console.log(video);
        //download the video from s3 and save it in the temp folder
        let downloadPath = "temp/downloads/" + video._id;
        if (!fs.existsSync("temp/downloads/")) {
            fs.mkdirSync("temp/downloads/", { recursive: true });
        }
        let downloaded = await s3Service.downloadVideo(process.env.AWS_STORAGE_BUCKET_NAME, video._id.toString(), downloadPath);
        const inputFilePath = downloadPath; // Path to the input video file
        const outputDir = 'temp/fragmented/' + video._id + "/"; // Path to output directory for chunks

        // Split video into 5-second chunks
        let timestamps = await ffmpegUtils.splitVideoIntoChunks(inputFilePath, outputDir);
        console.log(timestamps);
        // Update video status to 'fragmented'
        video.status = 'fragmented';
        await video.save();

        // store the fragmented files in gridfs
        //await storeInGridFS(outputDir);
        let x = await chunkStorage.uploadAllFilesToGridfs(gridFSBucket, video._id, outputDir, timestamps);
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