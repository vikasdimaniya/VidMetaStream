// src/routes/query-processor
const queryProcessorAPIs = require("../api/query-processor.js");
const batchQueryAPI = require("../api/batch-query.js");
const paginatedQueryAPI = require("../api/paginated-query.js");
const querySchemas = require("../schema/query-processor.js");

async function videoRoutes(app) {
    // Register global error handler
    app.setErrorHandler((error, request, reply) => {
        console.error(`Error processing request: ${error.message}`);
        
        // Handle known error types
        if (error.statusCode) {
            return reply.code(error.statusCode).send({ error: error.message });
        }
        
        // Default error response
        return reply.code(500).send({ 
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'production' ? undefined : error.message
        });
    });

    // Batch query endpoint for processing multiple queries in a single request
    app.post('/query/batch', {
        schema: {
            body: {
                type: 'object',
                required: ['queries'],
                properties: {
                    queries: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 10,
                        items: {
                            type: 'object',
                            required: ['type'],
                            properties: {
                                type: { type: 'string' },
                                params: { type: 'object' },
                                body: { type: 'object' },
                                pathParams: { type: 'object' }
                            }
                        }
                    }
                }
            }
        },
        handler: batchQueryAPI.batchQuery
    });

    // Paginated query endpoints for handling large result sets
    app.get('/query/spatialObjectsPaginated', {
        schema: {
            querystring: {
                type: 'object',
                required: ['objects'],
                properties: {
                    objects: { 
                        oneOf: [
                            { 
                                type: 'array', 
                                minItems: 1,
                                items: { type: 'string' }
                            },
                            { type: 'string', pattern: '^\\[.*\\]$' } // For JSON string arrays
                        ]
                    },
                    area: { 
                        oneOf: [
                            { type: 'string' }, // For named areas like "top-half"
                            { 
                                type: 'array', 
                                minItems: 4, 
                                maxItems: 4,
                                items: { type: 'number' }
                            },
                            { type: 'string', pattern: '^\\[.*\\]$' } // For JSON string arrays
                        ]
                    },
                    page: { type: 'integer', minimum: 1 },
                    limit: { type: 'integer', minimum: 1, maximum: 100 }
                }
            }
        },
        handler: paginatedQueryAPI.paginatedSpatialObjects
    });

    app.get('/query/queryInstancesPaginated', {
        schema: {
            querystring: {
                type: 'object',
                required: ['object'],
                properties: {
                    object: { type: 'string', minLength: 1 },
                    page: { type: 'integer', minimum: 1 },
                    limit: { type: 'integer', minimum: 1, maximum: 100 }
                }
            }
        },
        handler: paginatedQueryAPI.paginatedInstances
    });

    app.get('/query/stream', {
        schema: {
            querystring: {
                type: 'object',
                required: ['objects'],
                properties: {
                    objects: { 
                        oneOf: [
                            { 
                                type: 'array', 
                                minItems: 1,
                                items: { type: 'string' }
                            },
                            { type: 'string', pattern: '^\\[.*\\]$' } // For JSON string arrays
                        ]
                    }
                }
            }
        },
        handler: paginatedQueryAPI.streamResults
    });

    app.get('/query/objects', {
        ...querySchemas.queryVideosSchema,
        handler: queryProcessorAPIs.queryVideos
    });
    
    app.get('/query/spatialObjects', {
        ...querySchemas.spatialObjectsSchema,
        handler: queryProcessorAPIs.querySpatialObjects
    });
    
    app.get('/query/spatialObjectsTemporal', {
        ...querySchemas.spatialObjectsTemporalSchema,
        handler: queryProcessorAPIs.querySpatialObjectsTemporal
    });
    
    app.get('/query/spatialObjectsAnd', {
        ...querySchemas.spatialObjectsAndSchema,
        handler: queryProcessorAPIs.querySpatialObjectsAnd
    });
    
    // Finding Instances of the same class ex person
    app.get('/query/queryDistinctInstances', {
        ...querySchemas.queryInstancesSchema,
        handler: queryProcessorAPIs.queryInstances
    });
    
    // Finding overlap of the same class ex person and person
    app.get('/query/queryInstanceOverlaps', {
        ...querySchemas.queryInstanceOverlapsSchema,
        handler: queryProcessorAPIs.queryInstanceOverlaps
    });
    
    // Utilizing overlap of the same class ex person and person
    // and finding if it occurs in a desired area
    app.get('/query/queryInstanceOverlapsInArea', {
        ...querySchemas.instanceOverlapsInAreaSchema,
        handler: queryProcessorAPIs.queryInstanceOverlapsInArea
    });   
    
    // Getting instances of objects at entered time, in seconds
    app.get('/query/queryInstancesAtTime', {
        ...querySchemas.instancesAtTimeSchema,
        handler: queryProcessorAPIs.queryInstancesAtTime
    });   
    
    app.post('/query/chunks', {
        ...querySchemas.getVideoChunksSchema,
        handler: queryProcessorAPIs.getVideoChunks
    });
    
    app.get('/query/chunk/download/:chunk_id', {
        ...querySchemas.downloadVideoChunkSchema,
        handler: queryProcessorAPIs.downloadVideoChunk
    });
    
    app.get('/query/tempral/objects', {
        ...querySchemas.querySequenceSchema,
        handler: queryProcessorAPIs.querySequence
    });
}

module.exports = videoRoutes;