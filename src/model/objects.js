const mongoose  = require('mongoose');

const objectSchema = new mongoose.Schema({
    video_id: String,
    object_name: String,
    start_time: Number,
    end_time: Object,
    location: Array
});
module.exports = mongoose.model('object', objectSchema);