const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const core = require("../../core.js");
const pump = promisify(pipeline);

/**
 * Get a signed URL for uploading a video to S3.
 * @param {string} bucketName - The S3 bucket name.
 * @param {string} key - The object key (e.g., filename).
 * @param {number} expiresIn - Expiration time in seconds (default: 3600 seconds).
 * @returns {Promise<string>} - A signed URL for uploading the video.
 */
async function getUploadSignedUrl(bucketName, key, expiresIn = 3600) {
    try {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: 'video/mp4', // Adjust the content type as needed
        });

        const signedUrl = await getSignedUrl(core.s3Client, command, { expiresIn });
        return signedUrl;
    } catch (error) {
        console.error("Error generating signed URL for upload:", error);
        throw new Error("Could not generate signed URL for upload.");
    }
}
async function uploadVideo(bucketName, key, fileContent) {
    try {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: fileContent,
            ContentType: 'video/mp4', // Adjust the content type as needed
        });

        const response = await core.s3Client.send(command);
        console.log("Upload successful:", response);
    } catch (error) {
        console.error("Error uploading video:", error);
        throw new Error("Could not upload video.");
    }
}
/**
 * Download a video from S3 to a local file.
 * @param {string} bucketName - The S3 bucket name.
 * @param {string} key - The object key (e.g., filename).
 * @param {string} downloadPath - The local file path to save the downloaded video.
 * @returns {Promise<void>} - Resolves when the download is complete.
 */
async function downloadVideo(bucketName, key, downloadPath) {
    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        const response = await core.s3Client.send(command);

        // Stream the S3 object to the local file
        await pump(response.Body, fs.createWriteStream(downloadPath));
        console.log(`File downloaded to ${downloadPath}`);
    } catch (error) {
        console.error("Error downloading video from S3:", error);
        throw new Error("Could not download video from S3.");
    }
}

module.exports = {
    getUploadSignedUrl,
    uploadVideo,
    downloadVideo,
};
