require('dotenv').config();
console.log("AWS_REGION:", process.env.AWS_REGION);
const mongoose = require('mongoose');
const { S3Client } = require('@aws-sdk/client-s3');
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const mongoURI = 'mongodb://localhost:27017';
const dbName = 'vidmetastream';

let db;
let gridFSBucket;

async function initMongo() {
    try {
        const connection = await mongoose.connect(process.env.MONGODB_URI, {
            dbName: dbName,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        }); // Connect to MongoDB
        db = mongoose.connection; // Access the native MongoDB driver’s DB instance
        console.log('Connected to MongoDB');
        gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: "filesBucket",
            chunkSizeBytes: 1024 * 1024 * 5, // Set chunk size to 5 MB
        });
        console.log('Connected to GridFS');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error; // Re-throw the error for proper handling
    }
}

module.exports = {
    initMongo,
    getDb: () => db,
    getGridFSBucket: () => gridFSBucket,
    s3Client
};
