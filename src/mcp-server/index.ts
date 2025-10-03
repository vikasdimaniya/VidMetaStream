import { MCPServer } from '@modelcontextprotocol/sdk';
import { VideoQueryProcessor } from './processors/video';
import mcpConfig from '../config/mcp.config';

export const mcpServer = new MCPServer({
    port: mcpConfig.port,
    host: mcpConfig.host,
    processors: [
        new VideoQueryProcessor()
    ]
}); 