'use strict';

export const apiSchema = {
    createVideo: {
        type: 'object',
        required: ['title', 'description', 'filename'],
        properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            filename: { type: 'string' }
        }
    }
};