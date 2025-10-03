import mongoose from 'mongoose';

const objectSchema = new mongoose.Schema({
    _id: String,
    video_id: String,
    object_name: String,
    start_time: Number,
    end_time: Number,
    frames: Array
});

// ✅ CRITICAL PERFORMANCE INDEXES
// Single field indexes for common queries
objectSchema.index({ object_name: 1 }, { background: true });
objectSchema.index({ video_id: 1 }, { background: true });

// Compound indexes for complex queries (order matters - most selective first)
objectSchema.index({ object_name: 1, video_id: 1 }, { background: true });
objectSchema.index({ object_name: 1, start_time: 1, end_time: 1 }, { background: true });
objectSchema.index({ video_id: 1, object_name: 1, start_time: 1 }, { background: true });

export default mongoose.model('objects', objectSchema);