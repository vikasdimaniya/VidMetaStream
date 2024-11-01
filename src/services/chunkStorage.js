const core = require('./core.js');
// Upload function with metadata storage
async function uploadFile(fileStream, metadata) {
    const uploadStream = core.gridFSBucket.openUploadStream(metadata.filename);
    fileStream.pipe(uploadStream);
    uploadStream.on('finish', async () => {
        const newFile = new FileMetadata(metadata);
        await newFile.save();
        console.log('File and metadata saved successfully');
    });
}

module.exports = { uploadFile };