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
        enum: ['created', 'uploaded', 'analyzing', 'analyzed', 'fragmenting', 'fragmented', 'ready', 'error'],
        default: 'created'
    }
});

export default mongoose.model('video', videoSchema);