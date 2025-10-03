import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import videoRoutes from './src/routes/video.js';
import queryRoutes from './src/routes/query-processor.js';
import db from './src/db.js';
import dotenv from 'dotenv';
import { mcpServer } from './src/mcp-server.js';

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
await videoRoutes(fastify);
await queryRoutes(fastify);

// Start the server
const start = async () => {
    try {
        await fastify.listen({ port: process.env.PORT || 8000, host: '0.0.0.0' });
        console.log(`API server running on port ${process.env.PORT || 8000}`);
        
        // MCP server is already connected via StdioServerTransport in mcp-server.js
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();