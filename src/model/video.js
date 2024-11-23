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
        enum: ['created', 'uploaded', 'analyzing', 'analized', 'fragmenting', 'fragmented', 'ready', 'error'],
        default: 'created'
    }
});
module.exports = mongoose.model('video', videoSchema);