const fs = require('fs');
const path = require('path');

// Upload function with metadata storage
module.exports = {
    uploadFile: function (gridFSBucket, filePath, metadata) {
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
    },

    uploadAllFilesToGridfs: async function (gridFSBucket, videoID, dir, timestamps) {
        let promiseList = [];
        const files = fs.readdirSync(dir);

        let cumulativeTimestamp = 0; // Initialize cumulative timestamp

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const duration = timestamps[i].duration;

            // Round duration and cumulative timestamp to 1 decimal point
            const roundedDuration = Math.round(duration * 10) / 10;
            const startTimestamp = Math.round(cumulativeTimestamp * 10) / 10;

            // Update cumulative timestamp
            cumulativeTimestamp += roundedDuration;

            // Metadata to store in GridFS
            const metadata = {
                videoID,
                duration: roundedDuration,
                startTimestamp,
                endTimestamp: Math.round(cumulativeTimestamp * 10) / 10, // Cumulative timestamp after this chunk
            };

            console.log(`Uploading ${file} with metadata:`, metadata);

            let promise = this.uploadFile(gridFSBucket, path.join(dir, file), metadata);
            promiseList.push(promise);
        }

        // Wait for all uploads to complete
        let results = await Promise.all(promiseList);
        return results;
    },
    /**
     * Downloads a file from GridFS to a specified local path.
     * @param {ObjectId} fileId - The GridFS file ID to download.
     * @param {string} destinationPath - The local file path where the file will be saved.
     * @returns {Promise<void>}
     */
    downloadFile: async (fileId, destinationPath) => {
        const bucket = new GridFSBucket(db, { bucketName: 'fs' });

        return new Promise((resolve, reject) => {
            const downloadStream = bucket.openDownloadStream(fileId);
            const writeStream = fs.createWriteStream(destinationPath);

            downloadStream
                .pipe(writeStream)
                .on('finish', () => {
                    console.log(`File downloaded to: ${destinationPath}`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error(`Error downloading file ${fileId}:`, err);
                    reject(err);
                });
        });
    },

    /**
     * Fetches the metadata of files matching a given query.
     * @param {Object} query - The MongoDB query to filter files.
     * @returns {Promise<Array>} - Array of matching file documents.
     */
    getFilesMetadata: async (query) => {
        const files = await db.collection('fs.files').find(query).toArray();
        return files;
    },
};
