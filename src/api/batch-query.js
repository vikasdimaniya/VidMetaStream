/**
 * Batch query API for processing multiple queries in a single request
 */

const queryProcessorAPIs = require('./query-processor');
const { ApiError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Process a batch of queries
 * @param {Object} req - Request object
 * @param {Object} reply - Reply object
 */
async function batchQuery(req, reply) {
  try {
    // Validate request body
    const queries = req.body.queries;
    
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      throw new ApiError('Invalid request: queries must be a non-empty array', 400);
    }
    
    if (queries.length > 10) {
      throw new ApiError('Too many queries: maximum 10 queries per batch', 400);
    }
    
    logger.info(`Processing batch of ${queries.length} queries`);
    
    // Process each query in parallel
    const results = await Promise.all(
      queries.map(async (query, index) => {
        try {
          // Validate query
          if (!query.type || typeof query.type !== 'string') {
            return { 
              index,
              error: 'Invalid query: type is required and must be a string' 
            };
          }
          
          // Check if we have a handler for this query type
          const handler = queryProcessorAPIs[query.type];
          if (!handler) {
            return { 
              index,
              error: `Unknown query type: ${query.type}` 
            };
          }
          
          // Create mock request and reply objects
          const mockReq = {
            query: query.params || {},
            body: query.body || {},
            params: query.pathParams || {}
          };
          
          const mockReply = {
            code: () => mockReply,
            send: (data) => data
          };
          
          // Execute the query
          logger.debug(`Executing query ${index} of type ${query.type}`);
          const result = await handler(mockReq, mockReply);
          
          return {
            index,
            result
          };
        } catch (error) {
          logger.error(`Error processing query ${index}: ${error.message}`, {
            stack: error.stack,
            query
          });
          
          return {
            index,
            error: error.message
          };
        }
      })
    );
    
    // Sort results by index to maintain order
    results.sort((a, b) => a.index - b.index);
    
    // Log completion
    logger.info(`Batch query completed: ${results.filter(r => !r.error).length} successful, ${results.filter(r => r.error).length} failed`);
    
    return reply.send({
      results: results.map(({ index, ...rest }) => rest)
    });
  } catch (error) {
    logger.error(`Error processing batch query: ${error.message}`, {
      stack: error.stack
    });
    
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
}

module.exports = {
  batchQuery
}; 