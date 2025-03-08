// src/routes/query-processor
const queryProcessorAPIs = require("../api/query-processor.js");
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