/**
 * LLM Query Routes
 * API routes for natural language query processing
 */

const llmService = require('../services/llm.service');
const queryContextService = require('../services/query-context.service');
const queryProcessor = require('../api/query-processor');

async function routes(fastify, options) {
  // Create a new session
  fastify.post('/api/llm/session', async (request, reply) => {
    try {
      const sessionId = await queryContextService.createSession();
      return { sessionId };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Failed to create session' });
    }
  });

  // Process natural language query
  fastify.post('/api/llm/query', {
    schema: {
      body: {
        type: 'object',
        required: ['query', 'sessionId'],
        properties: {
          query: { type: 'string' },
          sessionId: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { query, sessionId } = request.body;
        
        // Get previous queries for context
        const previousQueries = await queryContextService.getSessionQueries(sessionId);
        
        // Parse the natural language query
        const parsedQuery = await llmService.parseQuery(
          query, 
          sessionId, 
          previousQueries
        );
        
        // Execute the query using the existing query processor
        const queryResults = await executeQuery(
          parsedQuery.apiEndpoint, 
          parsedQuery.apiParams
        );
        
        // Generate natural language response
        const { response, queryContext } = await llmService.generateResponse(
          parsedQuery.queryId, 
          queryResults
        );
        
        return {
          queryId: parsedQuery.queryId,
          response,
          results: queryResults,
          interpretation: {
            queryType: parsedQuery.queryType,
            parameters: parsedQuery.parameters
          },
          windows: queryContext.result_windows
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to process query' });
      }
    }
  });

  // Get query context
  fastify.get('/api/llm/context/:queryId', {
    schema: {
      params: {
        type: 'object',
        required: ['queryId'],
        properties: {
          queryId: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { queryId } = request.params;
        const queryContext = await queryContextService.getQueryContext(queryId);
        
        if (!queryContext) {
          return reply.code(404).send({ error: 'Query context not found' });
        }
        
        return queryContext;
      } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to get query context' });
      }
    }
  });

  // Get query chain (conversation history)
  fastify.get('/api/llm/chain/:queryId', {
    schema: {
      params: {
        type: 'object',
        required: ['queryId'],
        properties: {
          queryId: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { queryId } = request.params;
        const queryChain = await queryContextService.getQueryChain(queryId);
        
        return { chain: queryChain };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to get query chain' });
      }
    }
  });

  // Find related queries for a video window
  fastify.get('/api/llm/related', {
    schema: {
      querystring: {
        type: 'object',
        required: ['videoId', 'startTime', 'endTime'],
        properties: {
          videoId: { type: 'string' },
          startTime: { type: 'number' },
          endTime: { type: 'number' },
          tolerance: { type: 'number' }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { videoId, startTime, endTime, tolerance = 5 } = request.query;
        
        const relatedQueries = await queryContextService.findRelatedWindows(
          videoId,
          parseFloat(startTime),
          parseFloat(endTime),
          parseFloat(tolerance)
        );
        
        return { queries: relatedQueries };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to find related queries' });
      }
    }
  });

  /**
   * Helper function to execute queries using the existing query processor
   * @param {string} endpoint - API endpoint
   * @param {Object} params - API parameters
   * @returns {Promise<Object>} Query results
   */
  async function executeQuery(endpoint, params) {
    // Map the endpoint to the appropriate query processor function
    const endpointMap = {
      '/query/objects': queryProcessor.queryVideos,
      '/query/spatialObjects': queryProcessor.querySpatialObjects,
      '/query/spatialObjectsAnd': queryProcessor.querySpatialObjectsAnd,
      '/query/tempral/objects': queryProcessor.querySequence,
      '/query/queryInstanceOverlaps': queryProcessor.queryInstanceOverlaps,
      '/query/spatialObjectsTemporal': queryProcessor.querySpatialObjectsTemporal,
      '/query/queryInstancesAtTime': queryProcessor.queryInstancesAtTime,
      '/query/queryInstanceOverlapsInArea': queryProcessor.queryInstanceOverlapsInArea
    };
    
    const queryFunction = endpointMap[endpoint];
    
    if (!queryFunction) {
      throw new Error(`Unsupported endpoint: ${endpoint}`);
    }
    
    // Parse parameters as needed
    const parsedParams = {};
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string' && (
        key === 'objects' || key === 'sequence' || key === 'area'
      )) {
        try {
          parsedParams[key] = JSON.parse(value);
        } catch (e) {
          parsedParams[key] = value;
        }
      } else {
        parsedParams[key] = value;
      }
    });
    
    // Execute the query
    return queryFunction(parsedParams);
  }
}

module.exports = routes; 