const videoAPIs = require("../api/video.js");
const apiSchema = require("../schema/video.js");
async function videoRoutes(app) {
    app.get('/video/:video_id', {
        handler: videoAPIs.getVideo
    });

    app.post('/video', {
        schema: {
            body: apiSchema.createVideo,
        },
        handler: videoAPIs.createVideo
    });

    app.post('/upload/:video_id', {
        handler: videoAPIs.uploadVideo
    });
}

module.exports = videoRoutes;