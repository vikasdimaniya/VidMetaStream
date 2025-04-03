import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    uploadTempLocation: {
        type: String
    },
    status: {
        type: String,
        enum: ['created', 'uploaded', 'processing', 'completed', 'error'],
        default: 'created'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

export const Video = mongoose.model('Video', videoSchema); 