const { S3Client, PutObjectCommand, GetObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
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
async function uploadVideoStream(bucketName, key, filePath) {
    try {
        // Create a readable stream from the file
        const fileStream = fs.createReadStream(filePath);

        // Prepare the S3 upload command with the file stream as Body
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: fileStream,
            ContentType: 'video/mp4', // Adjust the content type as needed
        });

        // Send the command to S3
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


async function uploadLargeVideoFile(bucketName, key, filePath) {
    const partSize = 32 * 1024 * 1024; // in mb
    const fileStream = fs.createReadStream(filePath, { highWaterMark: partSize });

    const createCommand = new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
    });

    const createResponse = await core.s3Client.send(createCommand);
    const uploadId = createResponse.UploadId;

    let parts = [];
    let partNumber = 1;

    for await (const chunk of fileStream) {
        const uploadPartCommand = new UploadPartCommand({
            Bucket: bucketName,
            Key: key,
            PartNumber: partNumber,
            UploadId: uploadId,
            Body: chunk,
        });

        const uploadPartResponse = await core.s3Client.send(uploadPartCommand);
        parts.push({ ETag: uploadPartResponse.ETag, PartNumber: partNumber });

        console.log(`Uploaded part ${partNumber} with ETag: ${uploadPartResponse.ETag}`);
        partNumber++;
    }

    const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
    });

    let response = await core.s3Client.send(completeCommand);
    console.log("File uploaded:", key, response);
}

/**
 * Check if a file exists in the S3 bucket
 * @param {string} bucketName - The S3 bucket name.
 * @param {string} key - The object key (e.g., filename).
 * @returns {Promise<boolean>} - Resolves to true if the file exists, throws an error otherwise.
 */
async function checkFileExists(bucketName, key) {
    try {
        const command = new HeadObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        await core.s3Client.send(command);
        return true; // File exists
    } catch (error) {
        console.error(`Error checking if file ${key} exists in ${bucketName}:`, error);
        throw new Error(`File ${key} does not exist in bucket ${bucketName}`);
    }
}

module.exports = {
    getUploadSignedUrl,
    uploadVideo,
    uploadVideoStream,
    uploadLargeVideoFile,
    downloadVideo,
    checkFileExists
};
