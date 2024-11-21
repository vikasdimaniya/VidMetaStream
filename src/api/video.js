const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const db = require('../db');

const pump = promisify(pipeline);

module.exports = {
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
        return video;
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
        if (!fs.existsSync('./temp')) {
            fs.mkdirSync('./temp');
        }
        let filename;
        for await (const part of parts) {
            // upload and save the file
            filename = part.filename;
            await pump(part.file, fs.createWriteStream(`./temp/${part.filename}`));
        }

        video.uploadTempLocation = filename;
        video.status = 'uploaded';
        let saved = await video.save();
        if (saved.errors || saved.error) {
            reply.code(500).send({ message: 'Error saving video' });
            console.log(saved.errors, saved.error);
            return;
        }
        return { message: 'files uploaded' };
    },
}