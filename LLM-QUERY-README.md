# VidMetaStream Natural Language Query Interface

This document provides instructions for setting up and using the natural language query interface for VidMetaStream.

## Overview

The VidMetaStream Natural Language Query Interface allows users to query video metadata using plain English. The system uses a Large Language Model (LLM) to interpret natural language queries and translate them into structured API calls to the existing VidMetaStream query endpoints.

## Features

- **Natural Language Queries**: Ask questions about your videos in plain English
- **Conversational Context**: The system maintains context for follow-up questions
- **Visual Results**: View video thumbnails and play relevant segments
- **Object Highlighting**: See detected objects highlighted in the video
- **Timeline Navigation**: Navigate through time windows where objects appear

## Setup

### Prerequisites

- Node.js (v14 or later)
- MongoDB
- OpenAI API key

### Installation

1. Install the required dependencies:

```bash
npm install
```

2. Set up environment variables:

Create a `.env` file in the root directory with the following variables:

```
# OpenAI API configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
OPENAI_TEMPERATURE=0.2
OPENAI_MAX_TOKENS=1000

# LLM context management
LLM_MAX_HISTORY_ITEMS=5
LLM_MAX_TOKENS_PER_ITEM=500
```

3. Start the server:

```bash
npm start
```

4. Access the web interface:

Open your browser and navigate to `http://localhost:8000`

## API Endpoints

### Session Management

#### POST /api/llm/session

Creates a new session for tracking conversation context.

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Query Processing

#### POST /api/llm/query

Processes a natural language query.

**Request Body:**
```json
{
  "query": "Show me videos with people and cars",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "queryId": "123e4567-e89b-12d3-a456-426614174000",
  "response": "I found 3 videos containing both people and cars...",
  "results": [...],
  "interpretation": {
    "queryType": "OBJECT_QUERY",
    "parameters": {
      "objects": ["person", "car"],
      "windowSize": 10
    }
  },
  "windows": [...]
}
```

### Context Retrieval

#### GET /api/llm/context/:queryId

Retrieves the context for a specific query.

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "query_id": "123e4567-e89b-12d3-a456-426614174000",
  "natural_query": "Show me videos with people and cars",
  "structured_query": {...},
  "api_endpoint": "/query/objects",
  "api_params": {...},
  "result_windows": [...],
  "created_at": "2023-03-09T12:00:00.000Z",
  "parent_query_id": null
}
```

#### GET /api/llm/chain/:queryId

Retrieves the chain of queries leading to a specific query.

**Response:**
```json
{
  "chain": [...]
}
```

#### GET /api/llm/related

Finds queries related to a specific video window.

**Query Parameters:**
- `videoId`: The video ID
- `startTime`: Start time in seconds
- `endTime`: End time in seconds
- `tolerance`: Time tolerance in seconds (optional, default: 5)

**Response:**
```json
{
  "queries": [...]
}
```

## Example Queries

Here are some example queries you can try:

- "Show me videos with people and cars"
- "Find videos where a person appears followed by a car"
- "Show me videos with people in the center of the frame"
- "Find videos with at least 3 people overlapping"
- "Show me videos with cars between 10 and 20 seconds"
- "Find videos where people are walking in the top half of the frame"

## Supported Query Types

The system supports the following types of queries:

1. **Object Queries**: Find videos containing specific objects
   - Example: "Show me videos with people and cars"

2. **Spatial Queries**: Find objects within specific spatial areas
   - Example: "Find videos where people appear in the top-left corner"

3. **Temporal Queries**: Find objects within specific time windows
   - Example: "Show me videos with cars between 10 and 20 seconds"

4. **Sequence Queries**: Find sequences of objects appearing in order
   - Example: "Find videos where a person appears followed by a car"

5. **Instance Queries**: Find overlapping instances of the same object
   - Example: "Show me videos with at least 3 people overlapping"

## Troubleshooting

### Common Issues

1. **LLM API Error**: If you see errors related to the OpenAI API, check your API key and ensure you have sufficient credits.

2. **Query Interpretation Error**: If the system misinterprets your query, try rephrasing it to be more specific.

3. **No Results**: If you get no results, try broadening your query or check if the objects you're looking for exist in your videos.

### Logs

Check the server logs for more detailed error information:

```bash
tail -f logs/server.log
```

## License

This project is licensed under the ISC License. 