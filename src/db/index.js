const video = require('../model/video.js');
const objects = require('../model/objects.js');
require('dotenv').config();

module.exports = {
    video,
    objects
};

const { MongoClient } = require('mongodb');

const connectToDatabase = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/your_database_name'; // Replace with your actual URI
    const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    db = client.db(); // Use the default database from the URI or specify a different one
    console.log('Connected to database');
};

const getDb = () => {
    if (!db) {
        throw new Error('Database not initialized. Call connectToDatabase first.');
    }
    return db;
};

module.exports = { connectToDatabase, getDb };