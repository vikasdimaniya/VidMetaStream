// src/routes/query-processor
const queryProcessorAPIs = require("../api/query-processor.js");
const apiSchema = require("../schema/video.js");
async function videoRoutes(app) {
    app.get('/query/objects', {
        handler: queryProcessorAPIs.queryVideos
    });
    app.get('/query/spatialObjects', {
        handler: queryProcessorAPIs.querySpatialObjects
    });
    app.get('/query/spatialObjectsAnd', {
        handler: queryProcessorAPIs.querySpatialObjectsAnd
    });
    // Finding Instances of the same class ex person IN POSTMAN
    app.get('/query/queryDistinctInstances', {
        handler: queryProcessorAPIs.queryInstances
    });
    // Finding overlap of the same class ex person and person IN POSTMAN
    app.get('/query/queryInstanceOverlaps', {
        handler: queryProcessorAPIs.queryInstanceOverlaps
    });
    // Utilizig overla of the same class ex person and person IN POSTMAN 
    // and finding if it occurs in a desired area
    app.get('/query/queryInstanceOverlapsInArea', {
        handler: queryProcessorAPIs.queryInstanceOverlapsInArea
    });   
    // Getting instances of objects at entered time, in seconds IN POSTMAN
    app.get('/query/queryInstancesAtTime', {
        handler: queryProcessorAPIs.queryInstancesAtTime
    });   
    app.post('/query/chunks', {
        handler: queryProcessorAPIs.getVideoChunks
    });
    app.get('/query/chunk/download/:chunk_id', {
        handler: queryProcessorAPIs.downloadVideoChunk
    });
    app.get('/query/tempral/objects', {
        handler: queryProcessorAPIs.querySequence
    })
}

module.exports = videoRoutes;