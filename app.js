const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const videoRoutes = require('./src/api/video.js'); // Import video routes

let app = Fastify({
    logger: true
});

app.register(multipart,{
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024, // Set max file size to 10GB
    },
});

app.get('/ping', async function (req, reply) {
    return reply.send({ ping: 'pong' });
});

app.register(videoRoutes);

module.exports = app;