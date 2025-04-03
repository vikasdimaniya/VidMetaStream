/**
 * MCP Configuration
 * Settings for the Model Context Protocol server
 */

export default {
  mcp: {
    port: process.env.MCP_PORT || 3001,
    host: process.env.MCP_HOST || 'localhost',
    llm: {
      provider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4',
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.2,
      maxTokens: 1000
    },
    api: {
      baseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
      timeout: 30000
    }
  },
  capabilities: {
    prompts: {
      processQuery: {
        description: "Process a natural language query",
        parameters: {
          naturalQuery: { type: "string" },
          sessionId: { type: "string" },
          previousQueries: { type: "array", optional: true }
        }
      }
    },
    resources: {
      queryContext: {
        description: "Query context information",
        properties: {
          sessionId: { type: "string" },
          queryId: { type: "string" },
          naturalQuery: { type: "string" },
          structuredQuery: { type: "object" },
          apiEndpoint: { type: "string" },
          apiParams: { type: "object" }
        }
      }
    },
    tools: {
      getContext: {
        description: "Get query context by ID",
        parameters: {
          queryId: { type: "string" }
        }
      }
    }
  }
}; 