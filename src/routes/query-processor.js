// src/routes/query-processor
const queryProcessorAPIs = require("../api/query-processor.js");
const apiSchema = require("../schema/video.js");
async function videoRoutes(app) {
    app.get('/query/objects', {
        handler: queryProcessorAPIs.queryVideos
    });
    app.get('/query/spatialObjects', {
        handler: queryProcessorAPIs.querySpatialObjects
    });
    app.post('/query/chunks', {
        handler: queryProcessorAPIs.getVideoChunks
    });
    app.get('/query/chunk/download/:chunk_id', {
        handler: queryProcessorAPIs.downloadVideoChunk
    });
    app.get('/query/tempral/objects', {
        handler: queryProcessorAPIs.querySequence
    })
}

module.exports = videoRoutes;