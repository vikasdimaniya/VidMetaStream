/**
 * Paginated query API for handling large result sets
 */

const queryProcessorUtils = require('../utils/query-processor');
const pagination = require('../utils/pagination');
const { ApiError } = require('../utils/errors');
const logger = require('../utils/logger');
const db = require('../db');

/**
 * Get paginated spatial objects
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function paginatedSpatialObjects(req, reply) {
  try {
    // Get query parameters
    let objects = req.query.objects;
    let area = req.query.area;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Parse objects if it's a string
    if (typeof objects === 'string') {
      try {
        objects = JSON.parse(objects);
      } catch (e) {
        // If JSON parsing fails, try to handle it as a single object
        if (objects.startsWith('[') && objects.endsWith(']')) {
          // It's likely a malformed JSON array, throw an error
          throw new ApiError(`Invalid objects format: ${objects}`, 400);
        } else {
          // Treat it as a single object
          objects = [objects];
        }
      }
    }
    
    // Ensure objects is an array
    if (!Array.isArray(objects)) {
      objects = [objects];
    }
    
    // Validate objects
    if (objects.length === 0) {
      throw new ApiError('Invalid objects parameter: must be a non-empty array', 400);
    }
    
    // Parse area if it's a string
    if (typeof area === 'string') {
      try {
        if (area.startsWith('[')) {
          area = JSON.parse(area);
        } else {
          // It's a named area, use the interpretRelativeArea function
          const interpretRelativeArea = require('../utils/area-interpreter').interpretRelativeArea;
          area = interpretRelativeArea(area);
          if (!area) {
            throw new ApiError(`Invalid area description: ${area}`, 400);
          }
        }
      } catch (e) {
        throw new ApiError(`Invalid area format: ${area}`, 400);
      }
    }
    
    logger.info(`Processing paginated spatial objects query`, {
      objects,
      area,
      page,
      limit
    });
    
    // Get total count first (for pagination info)
    const totalCount = await queryProcessorUtils.countSpatialObjects({ objects, area });
    
    // Get paginated results
    const results = await queryProcessorUtils.querySpatialObjectsWithPagination(
      { objects, area },
      (page - 1) * limit,
      limit
    );
    
    // Create pagination links
    const baseUrl = '/query/spatialObjectsPaginated';
    const paginatedResponse = pagination.addPaginationLinks(
      results,
      {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      },
      baseUrl
    );
    
    // Log query completion
    logger.query('Paginated spatial objects query completed', {
      objects,
      area,
      page,
      limit,
      totalResults: totalCount,
      returnedResults: results.length
    });
    
    return reply.send(paginatedResponse);
  } catch (error) {
    logger.error(`Error in paginated spatial objects query: ${error.message}`, {
      stack: error.stack
    });
    
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Get paginated instances
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function paginatedInstances(req, reply) {
  try {
    // Get query parameters
    const object = req.query.object;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Validate object
    if (!object || typeof object !== 'string') {
      throw new ApiError('Invalid object parameter: must be a non-empty string', 400);
    }
    
    logger.info(`Processing paginated instances query`, {
      object,
      page,
      limit
    });
    
    // Create MongoDB query
    const query = { object_name: object };
    
    // Get total count
    const totalCount = await db.objects.countDocuments(query);
    
    // Get paginated results
    const cursor = db.objects.find(query);
    const paginatedResult = await pagination.paginateCursor(cursor, { page, limit });
    
    // Create pagination links
    const baseUrl = '/query/queryInstancesPaginated';
    const paginatedResponse = pagination.addPaginationLinks(
      paginatedResult.results,
      paginatedResult.pagination,
      baseUrl
    );
    
    // Log query completion
    logger.query('Paginated instances query completed', {
      object,
      page,
      limit,
      totalResults: totalCount,
      returnedResults: paginatedResult.results.length
    });
    
    return reply.send({
      [object]: paginatedResponse
    });
  } catch (error) {
    logger.error(`Error in paginated instances query: ${error.message}`, {
      stack: error.stack
    });
    
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Stream large result sets
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function streamResults(req, reply) {
  try {
    // Get query parameters
    let objects = req.query.objects;
    
    // Parse objects if it's a string
    if (typeof objects === 'string') {
      try {
        objects = JSON.parse(objects);
      } catch (e) {
        // If JSON parsing fails, try to handle it as a single object
        if (objects.startsWith('[') && objects.endsWith(']')) {
          // It's likely a malformed JSON array, throw an error
          throw new ApiError(`Invalid objects format: ${objects}`, 400);
        } else {
          // Treat it as a single object
          objects = [objects];
        }
      }
    }
    
    // Ensure objects is an array
    if (!Array.isArray(objects)) {
      objects = [objects];
    }
    
    // Validate objects
    if (objects.length === 0) {
      throw new ApiError('Invalid objects parameter: must be a non-empty array', 400);
    }
    
    logger.info(`Processing streaming query`, {
      objects
    });
    
    // Set appropriate headers
    reply.header('Content-Type', 'application/json');
    reply.header('Transfer-Encoding', 'chunked');
    
    // Start the response
    reply.raw.write('{"results":[');
    
    // Get cursor for the query
    const cursor = await queryProcessorUtils.getQueryCursor({ objects });
    
    let first = true;
    let count = 0;
    
    // Stream results one by one
    await cursor.forEach(doc => {
      if (!first) {
        reply.raw.write(',');
      }
      reply.raw.write(JSON.stringify(doc));
      first = false;
      count++;
    });
    
    // End the response
    reply.raw.end('],"count":' + count + '}');
    
    // Log query completion
    logger.query('Streaming query completed', {
      objects,
      resultCount: count
    });
    
    return reply;
  } catch (error) {
    logger.error(`Error in streaming query: ${error.message}`, {
      stack: error.stack
    });
    
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
}

module.exports = {
  paginatedSpatialObjects,
  paginatedInstances,
  streamResults
}; 