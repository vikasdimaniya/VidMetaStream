/**
 * Query Context Service
 * Manages query context information for natural language queries
 */

import { QueryContext } from '../model/query-context.js';
import { v4 as uuidv4 } from 'uuid';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

class QueryContextService extends Server {
  constructor() {
    super({
      name: 'query-context',
      version: '1.0.0'
    }, {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {}
      }
    });
  }

  /**
   * Create a new session
   * @returns {string} New session ID
   */
  async createSession() {
    return uuidv4();
  }

  /**
   * Get recent queries for a session
   * @param {string} sessionId - The session ID
   * @param {number} limit - Maximum number of queries to return
   * @returns {Array} Recent queries
   */
  async getSessionQueries(sessionId, limit = 5) {
    return QueryContext.find({ session_id: sessionId })
      .sort({ created_at: -1 })
      .limit(limit);
  }

  /**
   * Get query context by ID
   * @param {string} queryId - The query ID
   * @returns {Object} Query context
   */
  async getQueryContext(queryId) {
    return QueryContext.findOne({ query_id: queryId });
  }

  /**
   * Update result windows for a query
   * @param {string} queryId - The query ID
   * @param {Array} resultWindows - The result windows
   * @returns {Object} Updated query context
   */
  async updateResultWindows(queryId, resultWindows) {
    return QueryContext.findOneAndUpdate(
      { query_id: queryId },
      { result_windows: resultWindows },
      { new: true }
    );
  }

  /**
   * Get the chain of queries leading to a query
   * @param {string} queryId - The query ID
   * @returns {Array} Chain of queries
   */
  async getQueryChain(queryId) {
    // Get the query and all its ancestors
    const query = await QueryContext.findOne({ query_id: queryId });
    if (!query) return [];

    const chain = [query];
    let currentQuery = query;

    while (currentQuery.parent_query_id) {
      const parentQuery = await QueryContext.findOne({ 
        query_id: currentQuery.parent_query_id 
      });
      
      if (!parentQuery) break;
      
      chain.unshift(parentQuery);
      currentQuery = parentQuery;
    }

    return chain;
  }

  /**
   * Find queries related to a video window
   * @param {string} videoId - The video ID
   * @param {number} startTime - Start time in seconds
   * @param {number} endTime - End time in seconds
   * @param {number} tolerance - Time tolerance in seconds
   * @returns {Array} Related queries
   */
  async findRelatedWindows(videoId, startTime, endTime, tolerance = 5) {
    // Find query contexts with windows that overlap with the given time range
    return QueryContext.find({
      'result_windows.video_id': videoId,
      $or: [
        {
          // Window starts within our range
          'result_windows.start_time': { 
            $gte: startTime - tolerance, 
            $lte: endTime + tolerance 
          }
        },
        {
          // Window ends within our range
          'result_windows.end_time': { 
            $gte: startTime - tolerance, 
            $lte: endTime + tolerance 
          }
        }
      ]
    });
  }

  async saveContext(context) {
    return QueryContext.create(context);
  }

  async getContext(queryId) {
    return this.getQueryContext(queryId);
  }

  async updateContext(queryId, updates) {
    return QueryContext.findOneAndUpdate(
      { query_id: queryId },
      updates,
      { new: true }
    );
  }

  async deleteContext(queryId) {
    return QueryContext.findOneAndDelete({ query_id: queryId });
  }
}

export default QueryContextService; 