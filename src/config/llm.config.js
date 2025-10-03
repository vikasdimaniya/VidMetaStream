/**
 * LLM Configuration
 * Settings for the Large Language Model integration
 */

import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

export const llmConfig = {
  // OpenAI API configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.2,
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
    timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000') // 30 seconds
  },
  
  // Alternative LLM providers can be configured here
  // For example, Anthropic Claude, Cohere, etc.
  
  // Context management
  context: {
    maxHistoryItems: parseInt(process.env.LLM_MAX_HISTORY_ITEMS || '5'),
    maxTokensPerItem: parseInt(process.env.LLM_MAX_TOKENS_PER_ITEM || '500')
  },
  
  // Prompt templates
  prompts: {
    // Default system message for query understanding
    systemMessage: process.env.LLM_SYSTEM_MESSAGE || 
      'You are an AI assistant for the VidMetaStream video query system. Your task is to interpret natural language queries about video content and translate them into structured API calls.'
  }
}; 