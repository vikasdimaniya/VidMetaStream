const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const videoRoutes = require('./src/routes/video.js'); // Import video routes
const queryProcessorRoutes = require("./src/routes/query-processor.js");
const core = require("./core.js"); // Initializes parameters

let app = Fastify({
    logger: true
});

app.register(multipart, {
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024, // Set max file size to 10GB
    },
});

app.get('/ping', async function (req, reply) {
    return reply.send({ ping: 'pong' });
});

app.register(videoRoutes);
app.register(queryProcessorRoutes);

const startServer = async () => {
    try {
        await core.initMongo(); // Initialize MongoDB
        console.log('MongoDB initialized successfully');
        await app.listen({ port: 8000 });
        console.log('Server listening on port 8000');
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;
