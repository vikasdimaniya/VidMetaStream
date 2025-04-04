import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';

// Upload function with metadata storage
export const uploadFile = function (gridFSBucket, filePath, metadata) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(gridFSBucket.openUploadStream(filePath, { metadata }))
            .on('finish', function (data) {
                return resolve(data);
            })
            .on('error', function (err) {
                console.error('An error occurred while uploading!', err);
                return reject({ error: err });
            });
    });
};

export const uploadAllFilesToGridfs = async function (gridFSBucket, videoID, dir, timestamps) {
    let promiseList = [];
    const files = fs.readdirSync(dir);

    let cumulativeTimestamp = 0; // Initialize cumulative timestamp

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const duration = timestamps[i].duration;

        // Round duration and cumulative timestamp to 1 decimal point
        const roundedDuration = Math.round(duration * 10) / 10;
        const startTime = Math.round(cumulativeTimestamp * 10) / 10;

        // Update cumulative timestamp
        cumulativeTimestamp += roundedDuration;

        // Metadata to store in GridFS
        const metadata = {
            videoID,
            duration: roundedDuration,
            startTime: startTime,
            endTime: Math.round(cumulativeTimestamp * 10) / 10, // Cumulative timestamp after this chunk
        };

        console.log(`Uploading ${file} with metadata:`, metadata);

        let promise = uploadFile(gridFSBucket, path.join(dir, file), metadata);
        promiseList.push(promise);
    }

    // Wait for all uploads to complete
    let results = await Promise.all(promiseList);
    return results;
};

export const getVideoFilesForTimeWindows = async (gridFSBucket, video_id, windows) => {
    const results = [];

    for (const window of windows) {
        const { startTime, endTime } = window;

        // MongoDB query to find overlapping files
        const matchingFiles = await gridFSBucket.find({
            'metadata.videoID': new ObjectId(video_id),
            $and: [
                { 'metadata.startTime': { $lt: endTime } }, // File starts before query ends
                { 'metadata.endTime': { $gt: startTime } }  // File ends after query starts
            ]
        }).toArray();

        // Append matching files to results
        results.push(...matchingFiles);
    }

    return results; // Return all matching files
};

/**
 * Stream a file directly from GridFS.
 * @param {ObjectId} fileId - The file's GridFS ID.
 * @returns {ReadableStream} - File stream from GridFS.
 */
export const downloadFileAsStream = (gridFSBucket, fileId) => {
    return gridFSBucket.openDownloadStream(fileId);
};

/**
 * Fetches the metadata of files matching a given query.
 * @param {Object} query - The MongoDB query to filter files.
 * @returns {Promise<Array>} - Array of matching file documents.
 */
export const getFilesMetadata = async (query) => {
    const files = await gridFSBucket.find(query).toArray();
    return files;
};

export const getChunk = async (gridFSBucket, chunkId) => {
    const file = await gridFSBucket.find({ _id: new ObjectId(chunkId) }).toArray();
    return file[0];
};

export default {
    uploadFile,
    uploadAllFilesToGridfs,
    getVideoFilesForTimeWindows,
    downloadFileAsStream,
    getFilesMetadata,
    getChunk
};
