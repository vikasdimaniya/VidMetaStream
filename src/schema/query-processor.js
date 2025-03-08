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
        }
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
        }
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
        }
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
        sequence: { 
          oneOf: [
            { 
              type: 'array', 
              minItems: 2,
              items: { type: 'string' }
            },
            { type: 'string', pattern: '^\\[.*\\]$' } // For JSON string arrays
          ]
        },
        window_size: { type: 'integer', minimum: 0 }
      }
    }
  }
};

module.exports = {
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