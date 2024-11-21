'use strict';

module.exports = {

    createVideo: {
        type: 'object',
        required: ['title'],
        properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            filename: { type: 'string' },
        }
    }
}