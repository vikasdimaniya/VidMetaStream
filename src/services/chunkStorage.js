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
};
