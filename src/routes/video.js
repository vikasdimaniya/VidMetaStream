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
}
