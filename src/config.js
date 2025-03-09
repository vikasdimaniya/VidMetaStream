/**
 * Application configuration
 */

// Load environment variables from .env file if present
require('dotenv').config();

// Default configuration values
const config = {
    // Server configuration
    server: {
        port: process.env.PORT || 8000,
        host: process.env.HOST || 'localhost',
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }
    },

    // Database configuration
    database: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vidmetastream',
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    },

    // AWS S3 configuration
    s3: {
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        videoBucket: process.env.AWS_STORAGE_BUCKET_NAME,
        chunkBucket: process.env.AWS_STORAGE_BUCKET_NAME,
        endpoint: process.env.AWS_S3_ENDPOINT_URL,
        forcePathStyle: process.env.AWS_S3_ADDRESSING_STYLE === 'path',
        // Flag to determine if we're using MinIO instead of AWS S3
        useMinIO: process.env.AWS_S3_ENDPOINT_URL ? true : false
    },

    // Video processing configuration
    video: {
        chunkDuration: process.env.CHUNK_DURATION || 10, // seconds
        tempDir: process.env.TEMP_DIR || '/tmp/vidmetastream',
        maxUploadSize: process.env.MAX_UPLOAD_SIZE || 1024 * 1024 * 100 // 100MB
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        dir: process.env.LOG_DIR || './logs'
    },

    // API configuration
    api: {
        baseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
        timeout: process.env.API_TIMEOUT || 30000 // 30 seconds
    },

    // Environment
    env: process.env.NODE_ENV || 'development',
    isDev: (process.env.NODE_ENV || 'development') === 'development',
    isProd: process.env.NODE_ENV === 'production'
};

module.exports = config; 