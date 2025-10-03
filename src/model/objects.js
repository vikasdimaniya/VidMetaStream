import mongoose from 'mongoose';

const objectSchema = new mongoose.Schema({
    _id: String,
    video_id: String,
    object_name: String,
    start_time: Number,
    end_time: Number,
    frames: Array
});

export default mongoose.model('objects', objectSchema);