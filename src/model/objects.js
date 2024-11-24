const mongoose  = require('mongoose');

const objectSchema = new mongoose.Schema({
    video_id: String,
    object_name: String,
    startTime: String,
    endTime: Object,
    location: Array
});
module.exports = mongoose.model('object', objectSchema);