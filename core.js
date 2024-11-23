const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

const mongoURI = 'mongodb://localhost:27017';
const dbName = 'vidmetastream';

let db;
let gridFSBucket;

async function initMongo() {
    try {
        const connection = await mongoose.connect(mongoURI, {
            dbName: dbName,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        }); // Connect to MongoDB
        db = mongoose.connection; // Access the native MongoDB driver’s DB instance
        console.log('Connected to MongoDB');
        gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: "filesBucket",
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
};
