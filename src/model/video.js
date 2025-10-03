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
}, { timestamps: true }); // Adds createdAt and updatedAt automatically

// ✅ PERFORMANCE INDEXES
// Index for status-based queries (e.g., find all 'ready' videos)
videoSchema.index({ status: 1, createdAt: -1 }, { background: true });
// Index for recent videos
videoSchema.index({ createdAt: -1 }, { background: true });

export default mongoose.model('video', videoSchema);