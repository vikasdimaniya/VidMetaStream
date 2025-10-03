// src/routes/query-processor
import queryProcessorAPIs from "../api/query-processor.js";
import batchQueryAPI from "../api/batch-query.js";
import paginatedQueryAPI from "../api/paginated-query.js";
import querySchemas from "../schema/query-processor.js";

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
                    objects: { type: 'string' },
                    area: { type: 'string' },
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
                    objects: { type: 'string' }
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
    
    app.get('/query/temporal/objects', {
        ...querySchemas.querySequenceSchema,
        handler: queryProcessorAPIs.querySequence
    });

    // Cache statistics endpoint for monitoring cache performance
    app.get('/cache/stats', async (req, reply) => {
        const queryCache = (await import('../utils/query-cache.js')).default;
        const { intervalTreeCache } = await import('../utils/query-processor.js');
        
        const queryCacheStats = queryCache.getStats();
        const intervalTreeStats = intervalTreeCache.getStats();
        
        return reply.send({
            queryCache: {
                ...queryCacheStats,
                description: {
                    hits: 'Number of cache hits',
                    misses: 'Number of cache misses',
                    sets: 'Number of cache entries created',
                    evictions: 'Number of entries evicted due to size limit',
                    entries: 'Current number of cached entries',
                    currentSizeMB: 'Current cache size in MB',
                    maxSizeMB: 'Maximum cache size limit in MB',
                    hitRate: 'Cache hit rate (0-1, where 1 = 100%)',
                    utilizationPercent: 'Cache memory utilization percentage'
                }
            },
            intervalTreeCache: {
                ...intervalTreeStats,
                description: {
                    size: 'Number of cached interval trees',
                    capacity: 'Maximum number of trees to cache',
                    utilizationPercent: 'Cache utilization percentage'
                }
            },
            timestamp: new Date().toISOString()
        });
    });

    // Cache invalidation endpoints for manual cache management
    app.delete('/cache/invalidate/video/:video_id', async (req, reply) => {
        const queryCache = (await import('../utils/query-cache.js')).default;
        const { video_id } = req.params;
        
        queryCache.invalidateVideo(video_id);
        
        return reply.send({
            success: true,
            message: `Cache invalidated for video_id: ${video_id}`,
            timestamp: new Date().toISOString()
        });
    });

    app.delete('/cache/invalidate/object/:object_name', async (req, reply) => {
        const queryCache = (await import('../utils/query-cache.js')).default;
        const { object_name } = req.params;
        
        queryCache.invalidateObject(object_name);
        
        return reply.send({
            success: true,
            message: `Cache invalidated for object_name: ${object_name}`,
            timestamp: new Date().toISOString()
        });
    });

    app.delete('/cache/clear', async (req, reply) => {
        const queryCache = (await import('../utils/query-cache.js')).default;
        
        queryCache.clear();
        
        return reply.send({
            success: true,
            message: 'Cache completely cleared',
            timestamp: new Date().toISOString()
        });
    });

    // Test endpoint for debugging
    app.get('/query/test', (req, reply) => {
        const objects = req.query.objects;
        const area = req.query.area;
        
        return reply.send({
            objectsType: typeof objects,
            objectsValue: objects,
            areaType: typeof area,
            areaValue: area
        });
    });
}

export default videoRoutes;