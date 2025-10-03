import { S3Client, PutObjectCommand, GetObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import core from '../../core.js';
import { Upload } from '@aws-sdk/lib-storage';

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    endpoint: process.env.AWS_S3_ENDPOINT_URL,
    forcePathStyle: true,
    tls: false,
    maxAttempts: 3
});

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
            ContentType: 'application/octet-stream'
        });

        const signedUrl = await getSignedUrl(s3Client, command, { 
            expiresIn: 3600,
            signableHeaders: new Set(['host'])
        });
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

        const response = await s3Client.send(command);
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
        const response = await s3Client.send(command);
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

        const response = await s3Client.send(command);

        // Stream the S3 object to the local file
        await pump(response.Body, fs.createWriteStream(downloadPath));
        console.log(`File downloaded to ${downloadPath}`);
    } catch (error) {
        console.error("Error downloading video from S3:", error);
        throw new Error("Could not download video from S3.");
    }
}

async function uploadLargeVideoFile(bucketName, key, filePath) {
    const fileStream = fs.createReadStream(filePath);
    
    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: bucketName,
            Key: key,
            Body: fileStream,
            ContentType: 'application/octet-stream'
        }
    });

    try {
        await upload.done();
        console.log(`Successfully uploaded ${key} to ${bucketName}`);
    } catch (err) {
        console.error('Error uploading file:', err);
        throw err;
    }
}

export const s3Service = {
    getUploadSignedUrl,
    uploadVideo,
    uploadVideoStream,
    uploadLargeVideoFile,
    downloadVideo,
    getDownloadSignedUrl: async (bucket, key) => {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key
        });

        return await getSignedUrl(s3Client, command, { 
            expiresIn: 3600,
            signableHeaders: new Set(['host'])
        });
    }
};
