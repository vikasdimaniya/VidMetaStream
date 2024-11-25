// src/routes/query-processor
const queryProcessorAPIs = require("../api/query-processor.js");
const apiSchema = require("../schema/video.js");
async function videoRoutes(app) {
    app.get('/query/objects', {
        handler: queryProcessorAPIs.queryVideos
    });
    app.post('/download/videos', {
        handler: queryProcessorAPIs.downloadVideoChunks
    });
    app.get('/query/spatialObjects', {
        handler: queryProcessorAPIs.querySpatialObjects
    });
}

module.exports = videoRoutes;