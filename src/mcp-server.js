import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import mcpConfig from './config/mcp.config.js';
import LLMService from './services/llm.service.js';
import QueryContextService from './services/query-context.service.js';

// Initialize services
const llmService = new LLMService();
const queryContextService = new QueryContextService();

// Create MCP server instance
const mcpServer = new Server(
  {
    name: "VidMetaStream",
    version: "1.0.0",
    handlers: {
      processQuery: {
        method: 'POST',
        handler: async (request) => {
          return await llmService.processQuery(request.params, request.context);
        }
      },
      getContext: {
        method: 'GET',
        handler: async (request) => {
          return await queryContextService.getContext(request.params.queryId);
        }
      }
    }
  },
  mcpConfig
);

// Create transport
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

export { mcpServer }; 