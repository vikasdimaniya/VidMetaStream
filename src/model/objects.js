const mongoose  = require('mongoose');

const objectSchema = new mongoose.Schema({
    _id: String,
    video_id: String,
    object_name: String,
    start_time: Number,
    end_time: Number,
    frames: Array
});
module.exports = mongoose.model('objects', objectSchema);