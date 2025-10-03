import { createModel } from 'mongoose-gridfs';
import mongoose from 'mongoose';

// Lazy initialization - only create GridFS model when first accessed
let mongooseGridFS = null;

const getFragmentsModel = () => {
    if (!mongooseGridFS) {
        // Check if connection is ready
        if (mongoose.connection.readyState === 0) {
            throw new Error('Database connection not established. Call connectDB() first.');
        }
        
        mongooseGridFS = createModel({
            modelName: 'Fragment',
            bucketName: 'Fragments',
            connection: mongoose.connection,
        });
    }
    return mongooseGridFS;
};

// Export the getter function as default
export default getFragmentsModel;