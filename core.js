const mongoose = require('mongoose');

const mongoURI = 'mongodb://localhost:27017';
const dbName = 'vidmetastream';
const { GridFSBucket } = require('mongodb');

let db;
let gridFSBucket;
async function initMongo() {
    try {
        const connection = await mongoose.connect(mongoURI,{
            dbName: dbName
        }); // Connect to MongoDB
        db = mongoose.connection; // Access the native MongoDB driver’s DB instance
        console.log('Connected to MongoDB');
        gridFSBucket = new GridFSBucket(db.db, { bucketName: 'uploads' });
        console.log('Connected to GridFS');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

module.exports = { initMongo, db, gridFSBucket };