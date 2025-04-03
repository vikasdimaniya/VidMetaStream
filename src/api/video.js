import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import db from '../db/index.js';
import { s3Service } from '../services/s3.js';

const pump = promisify(pipeline);

export const videoAPIs = {
    /**
     * Get a list of all videos
     * This will return a list of all videos in the database
     * The videos will be returned as an array of objects
     */
    getVideo: async (req, reply) => {
        if (!req.params.video_id) {
            reply.code(400).send({ message: 'No video id provided' });
            return;
        }

        return db.video.findById(req.params.video_id);
    },

    /**
     * Create a new video, this will create a new video in the database with the title and description
     * After this you have to call post /upload/:video_id to upload the video file
     */
    createVideo: async (req, reply) => {
        let video = new db.video({
            title: req.body.title,
            description: req.body.description,
            filename: req.body.filename
        });
        
        await video.save();

        let url = await s3Service.getUploadSignedUrl(process.env.AWS_STORAGE_BUCKET_NAME, video._id.toString());
        return {video, upload_url: url};
    },

    /**
     * Upload a video file
     * This will upload a video file to the server and save the location in the database
     * The video will be processed by the fragmenter cron job and stored in the gridfs
     */
    uploadVideo: async (req, reply) => {
        const parts = req.files();
        if (!parts) {
            reply.code(400).send({ message: 'No file uploaded' });
            return;
        }
        if (parts.length > 1) {
            reply.code(400).send({ message: 'Only one file allowed' });
            return;
        }
        if (!req.params.video_id) {
            reply.code(400).send({ message: 'No video id provided' });
            return;
        }
        const video = await db.video.findById(req.params.video_id);
        if (!video) {
            reply.code(404).send({ message: 'Video not found' });
            return;
        }
        if (!fs.existsSync('./temp/uploads')) {
            fs.mkdirSync('./temp/uploads');
        }
        let filename;
        for await (const part of parts) {
            // upload and save the file
            filename = part.filename;
            await pump(part.file, fs.createWriteStream(`./temp/uploads/${part.filename}`));
        }

        video.uploadTempLocation = './temp/uploads/'+filename;

        // upload the video to s3
        let key = video._id.toString();
        await s3Service.uploadLargeVideoFile(process.env.AWS_STORAGE_BUCKET_NAME, key, video.uploadTempLocation);
        video.status = 'uploaded';
        let saved = await video.save();
        if (saved.errors || saved.error) {
            reply.code(500).send({ message: 'Error saving video' });
            console.log(saved.errors, saved.error);
            return;
        }
        // remove the temp file
        fs.unlinkSync(video.uploadTempLocation);
        return { message: 'files uploaded' };
    },

    /**
     * Notifies the server that a direct S3 upload is complete
     * This updates the video status to 'uploaded' so that processing can begin
     * This endpoint should be called by the frontend after completing a direct upload to S3
     */
    notifyUploadComplete: async (req, reply) => {
        if (!req.params.video_id) {
            reply.code(400).send({ message: 'No video id provided' });
            return;
        }

        try {
            // Verify the video exists
            const video = await db.video.findById(req.params.video_id);
            if (!video) {
                reply.code(404).send({ message: 'Video not found' });
                return;
            }

            // Optional: Verify the file exists in S3 before updating status
            try {
                await s3Service.checkFileExists(process.env.AWS_STORAGE_BUCKET_NAME, req.params.video_id);
            } catch (error) {
                console.error('Error verifying file in S3:', error);
                reply.code(400).send({ message: 'Video file not found in storage. Upload may not be complete.' });
                return;
            }

            // Update the video status
            video.status = 'uploaded';
            await video.save();

            return { 
                message: 'Upload notification received. Video processing will begin soon.',
                video_id: video._id,
                status: video.status
            };
        } catch (error) {
            console.error('Error in notifyUploadComplete:', error);
            reply.code(500).send({ message: 'Server error while processing upload notification' });
        }
    }
};