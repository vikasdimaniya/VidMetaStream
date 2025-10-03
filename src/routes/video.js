import { videoAPIs } from '../api/video.js';
import { apiSchema } from '../schema/video.js';

export default async function videoRoutes(app) {
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

    // Notify that direct S3 upload is complete
    app.post('/video/:video_id/upload-complete', {
        handler: videoAPIs.notifyUploadComplete
    });

    // Webhook for video processing completion (invalidates cache)
    app.post('/video/:video_id/processed', {
        handler: videoAPIs.videoProcessed
    });
}
