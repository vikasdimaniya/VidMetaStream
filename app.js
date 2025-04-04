const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const videoRoutes = require('./src/routes/video.js'); // Import video routes
const queryProcessorRoutes = require("./src/routes/query-processor.js");
const cors = require('@fastify/cors'); // Import CORS plugin
const core = require("./core.js") //initializes parameters
let app = Fastify({
    logger: true
});

// Register CORS
app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*', // Allow requests from any origin
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
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
app.register(queryProcessorRoutes);

module.exports = app;