/**
 * LLM Service
 * Handles interactions with the Large Language Model
 */

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { QueryContext } from '../model/query-context.js';
import { llmConfig } from '../config/llm.config.js';
import { promptTemplates } from '../utils/prompt-templates.js';

class LLMService extends Server {
  constructor() {
    super({
      name: 'llm',
      version: '1.0.0'
    }, {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {}
      }
    });
    // Initialize OpenAI API with v4 client
    this.openai = new OpenAI({
      apiKey: llmConfig.openai.apiKey,
    });
    this.model = llmConfig.openai.model;
    this.temperature = llmConfig.openai.temperature;
    this.maxTokens = llmConfig.openai.maxTokens;
  }

  /**
   * Parse a natural language query into a structured API call
   * @param {string} naturalQuery - The user's natural language query
   * @param {string} sessionId - The session ID for context tracking
   * @param {Array} previousQueries - Previous queries in the session for context
   * @returns {Object} Structured query information
   */
  async processQuery(query, context) {
    try {
      const { naturalQuery, sessionId, previousQueries = [] } = query;

      // Format conversation history for context
      const conversationHistory = previousQueries.map(q => ({
        role: 'user',
        content: q.natural_query
      }));

      // Add the current query
      conversationHistory.push({
        role: 'user',
        content: naturalQuery
      });

      // Create system message with instructions
      const systemMessage = {
        role: 'system',
        content: this._getQueryUnderstandingPrompt()
      };

      // Call OpenAI API with v4 client
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [systemMessage, ...conversationHistory],
        temperature: this.temperature,
        max_tokens: this.maxTokens
      });

      // Extract and parse the response
      const llmResponse = response.choices[0].message.content;
      const parsedQuery = this._extractStructuredQuery(llmResponse);

      // Generate a unique query ID
      const queryId = uuidv4();

      // Determine parent query if this is a follow-up
      const parentQueryId = previousQueries.length > 0 
        ? previousQueries[previousQueries.length - 1].query_id 
        : null;

      // Create query context object
      const queryContext = {
        session_id: sessionId,
        query_id: queryId,
        natural_query: naturalQuery,
        structured_query: parsedQuery,
        api_endpoint: parsedQuery.apiEndpoint,
        api_params: parsedQuery.apiParams,
        parent_query_id: parentQueryId
      };

      // Save to database
      await QueryContext.create(queryContext);

      return {
        queryId,
        ...parsedQuery
      };
    } catch (error) {
      console.error('Error processing query with LLM:', error);
      throw new Error('Failed to process natural language query');
    }
  }

  /**
   * Generate a natural language response based on query results
   * @param {string} queryId - The ID of the query
   * @param {Object} queryResults - The results of the query
   * @returns {Object} Response and updated query context
   */
  async generateResponse(queryId, queryResults) {
    try {
      const queryContext = await QueryContext.findOne({ query_id: queryId });
      if (!queryContext) {
        throw new Error('Query context not found');
      }

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this._getResponseGenerationPrompt(
              queryContext.natural_query,
              queryContext.structured_query,
              queryContext.api_endpoint,
              queryContext.api_params,
              queryResults
            )
          }
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens
      });

      return {
        response: response.choices[0].message.content,
        queryContext
      };
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error('Failed to generate natural language response');
    }
  }

  /**
   * Extract time windows from query results
   * @param {Object} queryResults - The results of the query
   * @returns {Array} Extracted time windows
   */
  _extractResultWindows(queryResults) {
    // Extract windows from query results based on result structure
    const windows = [];

    if (Array.isArray(queryResults)) {
      queryResults.forEach(result => {
        if (result.video_id) {
          // Handle different result formats
          if (result.windows) {
            // Sequence query results
            result.windows.forEach(window => {
              windows.push({
                video_id: result.video_id,
                start_time: this._parseTimeToSeconds(window.start_time),
                end_time: this._parseTimeToSeconds(window.end_time),
                objects: [] // Will be populated later if needed
              });
            });
          } else if (result.objects) {
            // Object query results
            const objectEntries = Array.isArray(result.objects) 
              ? result.objects 
              : Object.entries(result.objects).map(([key, value]) => ({ object_name: key, ...value }));
            
            // Find min and max timestamps across all objects
            let minTime = Infinity;
            let maxTime = -Infinity;
            const objectsInfo = [];

            objectEntries.forEach(obj => {
              const frames = obj.frames || [];
              if (frames.length > 0) {
                const timestamps = frames.map(f => f.timestamp);
                const min = Math.min(...timestamps);
                const max = Math.max(...timestamps);
                
                if (min < minTime) minTime = min;
                if (max > maxTime) maxTime = max;

                objectsInfo.push({
                  object_name: obj.object_name,
                  instances: [] // Instance IDs if available
                });
              }
            });

            if (minTime !== Infinity && maxTime !== -Infinity) {
              windows.push({
                video_id: result.video_id,
                start_time: minTime,
                end_time: maxTime,
                objects: objectsInfo
              });
            }
          }
        }
      });
    }

    return windows;
  }

  /**
   * Parse time string to seconds
   * @param {string|number} timeStr - Time string or number
   * @returns {number} Time in seconds
   */
  _parseTimeToSeconds(timeStr) {
    // Handle different time formats
    if (typeof timeStr === 'number') return timeStr;
    
    if (typeof timeStr === 'string') {
      // Format: "00:01:23.456"
      if (timeStr.includes(':')) {
        const [hours, minutes, seconds] = timeStr.split(':');
        return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
      }
      // Format: "123.456"
      return parseFloat(timeStr);
    }
    
    return 0;
  }

  /**
   * Extract structured query from LLM response
   * @param {string} llmResponse - The LLM response text
   * @returns {Object} Structured query information
   */
  _extractStructuredQuery(llmResponse) {
    try {
      // Try to parse as JSON first
      return JSON.parse(llmResponse);
    } catch (error) {
      // If not JSON, try to extract structured information
      const lines = llmResponse.split('\n');
      const queryType = this._extractValue(lines, 'Query type:');
      const objects = this._extractArray(lines, 'Objects:');
      const area = this._extractValue(lines, 'Area:');
      const sequence = this._extractArray(lines, 'Sequence:');
      const windowSize = this._extractNumber(lines, 'Window size:');
      const startTime = this._extractNumber(lines, 'Start time:');
      const endTime = this._extractNumber(lines, 'End time:');
      const count = this._extractNumber(lines, 'Count:');
      
      // Map to appropriate API endpoint and params
      let apiEndpoint, apiParams;
      
      switch (queryType) {
        case 'OBJECT_QUERY':
          apiEndpoint = '/query/objects';
          apiParams = {
            objects: JSON.stringify(objects),
            window_size: windowSize || 0
          };
          break;
        case 'SPATIAL_QUERY':
          apiEndpoint = '/query/spatialObjects';
          apiParams = {
            objects: JSON.stringify(objects),
            area: area || "[[0,0],[0,1],[1,1],[1,0]]"
          };
          break;
        case 'SEQUENCE_QUERY':
          apiEndpoint = '/query/tempral/objects';
          apiParams = {
            sequence: JSON.stringify(sequence || objects),
            window_size: windowSize || 10
          };
          break;
        case 'INSTANCE_QUERY':
          apiEndpoint = '/query/queryInstanceOverlaps';
          apiParams = {
            object: objects[0],
            count: count || 2
          };
          break;
        case 'TEMPORAL_QUERY':
          apiEndpoint = '/query/spatialObjectsTemporal';
          apiParams = {
            objects: JSON.stringify(objects),
            area: area || "[[0,0],[0,1],[1,1],[1,0]]",
            start_time: startTime || 0,
            end_time: endTime || 60
          };
          break;
        default:
          apiEndpoint = '/query/objects';
          apiParams = {
            objects: JSON.stringify(objects || ['person']),
            window_size: 0
          };
      }
      
      return {
        queryType,
        parameters: {
          objects,
          area,
          sequence,
          windowSize,
          startTime,
          endTime,
          count
        },
        apiEndpoint,
        apiParams
      };
    }
  }

  /**
   * Extract value from lines
   * @param {Array} lines - Array of text lines
   * @param {string} prefix - Prefix to look for
   * @returns {string|null} Extracted value or null
   */
  _extractValue(lines, prefix) {
    const line = lines.find(l => l.startsWith(prefix));
    return line ? line.substring(prefix.length).trim() : null;
  }

  /**
   * Extract array from lines
   * @param {Array} lines - Array of text lines
   * @param {string} prefix - Prefix to look for
   * @returns {Array} Extracted array
   */
  _extractArray(lines, prefix) {
    const value = this._extractValue(lines, prefix);
    if (!value) return [];
    
    // Try to parse as JSON array
    try {
      return JSON.parse(value);
    } catch (error) {
      // Split by commas and clean up
      return value.split(',').map(item => item.trim());
    }
  }

  /**
   * Extract number from lines
   * @param {Array} lines - Array of text lines
   * @param {string} prefix - Prefix to look for
   * @returns {number|null} Extracted number or null
   */
  _extractNumber(lines, prefix) {
    const value = this._extractValue(lines, prefix);
    return value ? parseFloat(value) : null;
  }

  /**
   * Get query understanding prompt
   * @returns {string} Prompt for query understanding
   */
  _getQueryUnderstandingPrompt() {
    return promptTemplates.queryUnderstanding || `You are an AI assistant for the VidMetaStream video query system. Your task is to interpret natural language queries about video content and translate them into structured API calls.

Please analyze the user's query and extract:
1. Query type (OBJECT_QUERY, SPATIAL_QUERY, TEMPORAL_QUERY, SEQUENCE_QUERY, INSTANCE_QUERY)
2. Objects mentioned (person, car, bicycle, etc.)
3. Spatial references (top, bottom, center, coordinates)
4. Temporal references (timestamps, durations)
5. Count requirements (number of instances)
6. Relationship requirements (followed by, together with)

Then, determine the appropriate API endpoint and parameters for this query.

Respond in JSON format with the following structure:
{
  "queryType": "OBJECT_QUERY",
  "parameters": {
    "objects": ["person", "car"],
    "area": "center",
    "sequence": ["person", "car"],
    "windowSize": 10,
    "startTime": 0,
    "endTime": 60,
    "count": 2
  },
  "apiEndpoint": "/query/objects",
  "apiParams": {
    "objects": ["person", "car"],
    "window_size": 10
  }
}`;
  }

  /**
   * Get response generation prompt
   * @param {string} userQuery - The user's natural language query
   * @param {Object} interpretedQuery - The interpreted query
   * @param {string} apiEndpoint - The API endpoint used
   * @param {Object} apiParams - The API parameters used
   * @param {Object} queryResults - The query results
   * @returns {string} Prompt for response generation
   */
  _getResponseGenerationPrompt(userQuery, interpretedQuery, apiEndpoint, apiParams, queryResults) {
    return promptTemplates.responseGeneration || `You are an AI assistant for the VidMetaStream video query system. Your task is to generate natural language responses to explain query results.

The user's query was: "${userQuery}"
The query was interpreted as: ${JSON.stringify(interpretedQuery)}
The API endpoint used was: ${apiEndpoint}
The parameters used were: ${JSON.stringify(apiParams)}
The results are: ${JSON.stringify(queryResults, null, 2)}

Please generate a natural, conversational response that:
1. Confirms what was searched for
2. Summarizes the results (number of videos, key features)
3. Explains any assumptions or interpretations made
4. Suggests possible refinements if appropriate`;
  }
}

export default LLMService; 