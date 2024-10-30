const fs = require('fs');
const util = require('util');
const pump = util.promisify(require('stream').pipeline);
const db = require('../db');

app.get('/videos/:video_id', async function (req, reply) {
    if (!req.params.video_id) {
        reply.code(400).send({ message: 'No video id provided' });
        return;
    }

    return db.video.find(req.params.video_id);
});

app.post('/videos', async function (req, reply) {
    let video = new db.video({
        title: req.body.title,
        description: req.body.description,
        filename: req.body.filename
    });
    await video.save();
    return video;
});

app.post('/upload/:video_id', async function (req, reply) {
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
    
    for await (const part of parts) {
        // upload and save the file
        await pump(part.file, fs.createWriteStream(`./temp/${part.filename}`));
    }

    video.uploadTempLocation = `./temp/${parts[0].filename}`;
    video.status = 'uploaded';
    let saved = await video.save();
    if (saved.errors || saved.error) {
        reply.code(500).send({ message: 'Error saving video' });
        console.log(saved.errors, saved.error);
        return;
    }
    return { message: 'files uploaded' };
});