const queryProcessorAPIs = require("../api/query-processor.js");
const apiSchema = require("../schema/video.js");
async function videoRoutes(app) {
    app.get('/query/objects', {
        handler: queryProcessorAPIs.queryVideos
    });
    app.post('/download/videos', {
        handler: queryProcessorAPIs.downloadVideoChunks
    })
}

module.exports = videoRoutes;