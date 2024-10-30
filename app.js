import Fastify from 'fastify';
import multipart from '@fastify/multipart';

let gridFSBucket;

const app = Fastify({
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

export { app, gridFSBucket };