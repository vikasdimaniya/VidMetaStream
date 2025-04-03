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

Create a `.env` file in the root directory with the following variables (or copy from `.env.example` and update):

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

## Using the Interface

1. **Ask a Question**: Type your query in natural language in the input box and press "Send"
   - Example: "Show me videos with people and cars"

2. **View Results**: The system will display matching videos with thumbnails and time windows

3. **Play Videos**: Click on a video thumbnail or a specific time window to play the video

4. **Ask Follow-up Questions**: The system maintains context, so you can ask follow-up questions
   - Example: "Only show the ones where they appear in the center"

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