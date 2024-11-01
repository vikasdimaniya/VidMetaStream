const { createModel} = require('mongoose-gridfs');
const mongoose = require('mongoose');

const mongooseGridFS = createModel({
    modelName: 'Fragment',
    bucketName: 'Fragments',
    connection: mongoose.connection,
});

module.exports = mongooseGridFS;