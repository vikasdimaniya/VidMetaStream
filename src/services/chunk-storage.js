import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';

// Upload function with metadata storage
export const uploadFile = function (gridFSBucket, filePath, metadata) {
    if (!gridFSBucket) {
        return Promise.reject(new Error('GridFSBucket is not initialized. Ensure core.initMongo() is called before using GridFS operations.'));
    }
    
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
    if (!gridFSBucket) {
        throw new Error('GridFSBucket is not initialized. Ensure core.initMongo() is called before using GridFS operations.');
    }
    
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

// Helper function to convert timestamp to seconds
const convertToSeconds = (timestamp) => {
    if (typeof timestamp === 'number') {
        return timestamp;
    }
    if (typeof timestamp === 'string') {
        // Handle "HH:MM:SS.mmm" format
        const parts = timestamp.split(':');
        if (parts.length === 3) {
            const hours = parseFloat(parts[0]);
            const minutes = parseFloat(parts[1]);
            const seconds = parseFloat(parts[2]);
            return hours * 3600 + minutes * 60 + seconds;
        }
        // Handle plain number string
        return parseFloat(timestamp);
    }
    return timestamp;
};

export const getVideoFilesForTimeWindows = async (gridFSBucket, video_id, windows) => {
    if (!gridFSBucket) {
        throw new Error('GridFSBucket is not initialized. Ensure core.initMongo() is called before using GridFS operations.');
    }
    
    const results = [];

    for (const window of windows) {
        let { startTime, endTime } = window;
        
        // Convert timestamps to seconds if they're in string format
        startTime = convertToSeconds(startTime);
        endTime = convertToSeconds(endTime);

        console.log(`[GridFS Query] Searching for video_id: ${video_id}, window: ${startTime}-${endTime}s (converted to numbers)`);

        // MongoDB query to find overlapping chunks
        // Overlap occurs when: chunk.startTime < query.endTime AND chunk.endTime > query.startTime
        // This handles all overlap cases including:
        // - Chunk fully contains query window
        // - Query fully contains chunk
        // - Partial overlap (left or right)
        const query = {
            'metadata.videoID': new ObjectId(video_id),
            $or: [
                // Case 1: Chunk overlaps with query window
                {
                    $and: [
                        { 'metadata.startTime': { $lt: endTime } },   // Chunk starts before query ends
                        { 'metadata.endTime': { $gt: startTime } }    // Chunk ends after query starts
                    ]
                },
                // Case 2: Also check if boundaries match exactly (edge case for 5-10 matching at 5)
                {
                    $and: [
                        { 'metadata.startTime': { $lte: endTime } },   // <= for inclusive boundaries
                        { 'metadata.endTime': { $gte: startTime } }    // >= for inclusive boundaries
                    ]
                }
            ]
        };

        const matchingFiles = await gridFSBucket.find(query).toArray();
        
        console.log(`[GridFS Query] Found ${matchingFiles.length} matching chunks`);
        if (matchingFiles.length > 0) {
            console.log('[GridFS Query] Matching chunks:', matchingFiles.map(f => ({
                filename: f.filename,
                startTime: f.metadata?.startTime,
                endTime: f.metadata?.endTime,
                duration: f.metadata?.duration
            })));
        }
        
        // Append matching files to results
        results.push(...matchingFiles);
    }

    // Remove duplicates (same file might match multiple windows)
    const uniqueResults = Array.from(new Map(results.map(item => [item._id.toString(), item])).values());
    
    console.log(`[GridFS Query] Total unique chunks returned: ${uniqueResults.length}`);
    return uniqueResults;
};

/**
 * Stream a file directly from GridFS.
 * @param {ObjectId} fileId - The file's GridFS ID.
 * @returns {ReadableStream} - File stream from GridFS.
 */
export const downloadFileAsStream = (gridFSBucket, fileId) => {
    if (!gridFSBucket) {
        throw new Error('GridFSBucket is not initialized. Ensure core.initMongo() is called before using GridFS operations.');
    }
    
    return gridFSBucket.openDownloadStream(fileId);
};

/**
 * Fetches the metadata of files matching a given query.
 * @param {Object} query - The MongoDB query to filter files.
 * @returns {Promise<Array>} - Array of matching file documents.
 */
export const getFilesMetadata = async (gridFSBucket, query) => {
    if (!gridFSBucket) {
        throw new Error('GridFSBucket is not initialized. Ensure core.initMongo() is called before using GridFS operations.');
    }
    
    const files = await gridFSBucket.find(query).toArray();
    return files;
};

export const getChunk = async (gridFSBucket, chunkId) => {
    if (!gridFSBucket) {
        throw new Error('GridFSBucket is not initialized. Ensure core.initMongo() is called before using GridFS operations.');
    }
    
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
