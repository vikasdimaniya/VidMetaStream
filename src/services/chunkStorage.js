const fs = require('fs');
const path = require('path');
// Upload function with metadata storage

module.exports = {
    uploadFile: function(gridFSBucket, filePath) {
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath).
            pipe(gridFSBucket.openUploadStream(filePath))
            .on('finish',function(data) {
                return resolve(data);
            }).on('error', function(err) {
                console.log('An error occurred while upload!', err);
                console.log(err);
                return reject({error: err});
            });
        });
    },

    uploadAllFilesToGridfs: async function (gridFSBucket, dir) {
        let promisList = [];
        const files = fs.readdirSync(dir);
        for (const file of files) {
            let promise = this.uploadFile(gridFSBucket, path.join(dir, file));
            promisList.push(promise);
        }
        let x = await Promise.all(promisList);
        return x;
    }
};