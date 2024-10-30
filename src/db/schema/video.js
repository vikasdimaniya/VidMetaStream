import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
    title: String,
    description: String,
    filename: String,
    metadata: Object,
    uploadTempLocation: String,
    error: Object,
    status: {
        type: String,
        enum: ['uploaded', 'analized', 'fragmented', 'ready', 'error'],
        default: 'uploaded'
    }
});

export const Video = mongoose.model('video', videoSchema);