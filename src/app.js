import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import { videoAPIs } from './api/video.js';
import db from './db/index.js';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({
    logger: true
});

// Register plugins
fastify.register(fastifyMultipart);
fastify.register(fastifyCors, {
    origin: true
});

// Connect to MongoDB
await db.connectDB();

// Register routes
fastify.get('/video/:video_id', videoAPIs.getVideo);
fastify.post('/video', videoAPIs.createVideo);
fastify.post('/upload/:video_id', videoAPIs.uploadVideo);

// Start the server
const start = async () => {
    try {
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
        console.log(`Server is running on ${fastify.server.address().port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start(); 