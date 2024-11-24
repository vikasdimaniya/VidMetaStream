const mongoose  = require('mongoose');

const videoSchema = new mongoose.Schema({
    video_id: String,
    object_name: String,
    startTime: String,
    endTime: Object,
    location: Array
});
module.exports = mongoose.model('video', videoSchema);