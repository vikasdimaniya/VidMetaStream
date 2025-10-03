/**
 * Database module - ES6
 * This provides access to Mongoose models and connection
 */

import mongoose from 'mongoose';
import Objects from './model/objects.js';
import Fragments from './model/fragments.js';
import Video from './model/video.js';

// MongoDB connection
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vidmetastream');
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`Error: ${error.message}`);
        throw error;
    }
};

// Named exports for individual models and functions
export { connectDB, Objects as objects, Fragments as fragments, Video as videos };

// Default export with all properties
export default {
    connectDB,
    objects: Objects,
    fragments: Fragments,
    videos: Video,
    connection: mongoose.connection,
    // Provide access to collection() for GridFS operations
    collection: (name) => mongoose.connection.collection(name)
};

