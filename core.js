const mongoose = require('mongoose');

const mongoURI = 'mongodb://localhost:27017';
const dbName = 'vidmetastream';
const { GridFSBucket } = require('mongodb');

let db;
let gridFSBucket;
async function initMongo() {
    try {
        const connection = await mongoose.connect(mongoURI); // Connect to MongoDB
        db = connection.connection.db; // Access the native MongoDB driver’s DB instance
        console.log('Connected to MongoDB');
        let gridFSBucket;
        db.once('open', () => {
            gridFSBucket = new GridFSBucket(db.db, { bucketName: 'uploads' });
        });
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

module.exports = { initMongo, db };