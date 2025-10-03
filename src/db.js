/**
 * Database module - ES6
 * This provides access to Mongoose models and connection
 */

import mongoose from 'mongoose';
import Objects from './model/objects.js';
import getFragmentsModel from './model/fragments.js';
import Video from './model/video.js';

// MongoDB connection with optimized connection pooling
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vidmetastream', {
            maxPoolSize: 50,                   // Maximum 50 connections in pool (sufficient for most workloads)
            minPoolSize: 10,                   // Minimum 10 connections (keeps connections warm)
            serverSelectionTimeoutMS: 5000,    // 5 second timeout for server selection
            socketTimeoutMS: 45000,            // 45 second socket timeout
            family: 4                          // Use IPv4, skip trying IPv6 (faster connection)
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        console.log(`Connection Pool: min=10, max=50 (optimized)`);
        return conn;
    } catch (error) {
        console.error(`Error: ${error.message}`);
        throw error;
    }
};

// Create a proxy object for Fragments that lazily initializes on any property access
const fragmentsProxy = new Proxy({}, {
    get(target, prop) {
        const model = getFragmentsModel();
        return model[prop];
    },
    set(target, prop, value) {
        const model = getFragmentsModel();
        model[prop] = value;
        return true;
    }
});

// Named exports for individual models and functions
export { connectDB, Objects as objects, fragmentsProxy as fragments, Video as videos };

// Default export with all properties
export default {
    connectDB,
    objects: Objects,
    get fragments() {
        // Use getter to ensure lazy initialization
        return getFragmentsModel();
    },
    videos: Video,
    connection: mongoose.connection,
    // Provide access to collection() for GridFS operations
    collection: (name) => mongoose.connection.collection(name)
};

