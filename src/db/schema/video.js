const mongoose  = require('mongoose');

const videoSchema = new mongoose.Schema({
    title: String,
    description: String,
    filename: String,
    metadata: Object,
    uploadTempLocation: String,
    error: Object,
    status: {
        type: String,
        enum: ['created', 'uploaded', 'analized', 'fragmenting', 'fragmented', 'ready', 'error'],
        default: 'created'
    }
});
const Video = mongoose.model('video', videoSchema)
module.exports = {Video};