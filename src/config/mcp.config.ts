export default {
    port: process.env.MCP_PORT || 3001,
    host: process.env.MCP_HOST || 'localhost',
    llm: {
        provider: 'openai',
        model: process.env.OPENAI_MODEL || 'gpt-4',
        apiKey: process.env.OPENAI_API_KEY
    },
    api: {
        baseUrl: process.env.API_BASE_URL || 'http://localhost:8000'
    }
}; 