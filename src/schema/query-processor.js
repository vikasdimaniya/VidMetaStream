'use strict';

/**
 * JSON Schema definitions for query processor API endpoints
 */

// Schema for queryInstanceOverlapsInArea endpoint
const instanceOverlapsInAreaSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['object', 'count', 'area'],
      properties: {
        object: { type: 'string', minLength: 1 },
        count: { type: 'integer', minimum: 2 },
        area: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { 
            type: 'array',
            items: {
              type: 'object',
              properties: {
                video_id: { type: 'string' },
                success_intervals: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      start: { type: 'string' },
                      end: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Schema for queryInstancesAtTime endpoint
const instancesAtTimeSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['object', 'time'],
      properties: {
        object: { type: 'string', minLength: 1 },
        time: { type: 'number', minimum: 0 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          object: { type: 'string' },
          time: { type: 'number' },
          instances: { 
            type: 'array',
            items: { type: 'object' }
          }
        }
      }
    }
  }
};

// Schema for spatialObjectsTemporal endpoint
const spatialObjectsTemporalSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['objects', 'area', 'start_time', 'end_time'],
      properties: {
        objects: { type: 'string' },
        area: { type: 'string' },
        start_time: { type: 'number', minimum: 0 },
        end_time: { type: 'number', minimum: 0 }
      }
    }
  }
};

// Schema for queryVideos endpoint
const queryVideosSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['objects'],
      properties: {
        objects: { type: 'string' },
        window_size: { type: 'integer', minimum: 0 }
      }
    }
  }
};

// Schema for querySpatialObjects endpoint
const spatialObjectsSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['objects', 'area'],
      properties: {
        objects: { type: 'string' },
        area: { type: 'string' }
      }
    }
  }
};

// Schema for querySpatialObjectsAnd endpoint
const spatialObjectsAndSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['objects', 'area'],
      properties: {
        objects: { type: 'string' },
        area: { type: 'string' }
      }
    }
  }
};

// Schema for queryInstances endpoint
const queryInstancesSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['object'],
      properties: {
        object: { type: 'string', minLength: 1 }
      }
    }
  }
};

// Schema for queryInstanceOverlaps endpoint
const queryInstanceOverlapsSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['object', 'count'],
      properties: {
        object: { type: 'string', minLength: 1 },
        count: { type: 'integer', minimum: 2 }
      }
    }
  }
};

// Schema for getVideoChunks endpoint
const getVideoChunksSchema = {
  schema: {
    body: {
      type: 'object',
      required: ['videos'],
      properties: {
        videos: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['video_id', 'windows'],
            properties: {
              video_id: { type: 'string' },
              windows: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    start_time: { type: 'string' },
                    end_time: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Schema for downloadVideoChunk endpoint
const downloadVideoChunkSchema = {
  schema: {
    params: {
      type: 'object',
      required: ['chunk_id'],
      properties: {
        chunk_id: { type: 'string' }
      }
    }
  }
};

// Schema for querySequence endpoint
const querySequenceSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['sequence'],
      properties: {
        sequence: { type: 'string' },
        window_size: { type: 'integer', minimum: 0 }
      }
    }
  }
};

export {
  instanceOverlapsInAreaSchema,
  instancesAtTimeSchema,
  spatialObjectsTemporalSchema,
  queryVideosSchema,
  spatialObjectsSchema,
  spatialObjectsAndSchema,
  queryInstancesSchema,
  queryInstanceOverlapsSchema,
  getVideoChunksSchema,
  downloadVideoChunkSchema,
  querySequenceSchema
};

export default {
  instanceOverlapsInAreaSchema,
  instancesAtTimeSchema,
  spatialObjectsTemporalSchema,
  queryVideosSchema,
  spatialObjectsSchema,
  spatialObjectsAndSchema,
  queryInstancesSchema,
  queryInstanceOverlapsSchema,
  getVideoChunksSchema,
  downloadVideoChunkSchema,
  querySequenceSchema
}; 