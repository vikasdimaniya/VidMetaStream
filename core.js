require('dotenv').config();
const mongoose = require('mongoose');

const mongoURI = process.env.MONGODB_URI;
const dbName = 'vidmetastream';

let db;
let gridFSBucket;

async function initMongo() {
    try {
        await mongoose.connect(mongoURI, {
            dbName: dbName,
        });
        db = mongoose.connection; // Wait for the connection
        await new Promise((resolve, reject) => {
            db.once('open', resolve);
            db.on('error', reject);
        });
        console.log('Connected to MongoDB');

        // Initialize GridFSBucket after the connection is open
        gridFSBucket = new mongoose.mongo.GridFSBucket(db.db, {
            bucketName: 'filesBucket',
        });
        console.log('Connected to GridFS');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error;
    }
}

module.exports = {
    initMongo,
    getDb: () => db.db, // Ensure this points to the correct MongoDB instance
    getGridFSBucket: () => gridFSBucket,
};
