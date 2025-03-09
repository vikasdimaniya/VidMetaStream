# VidMetaStream Natural Language Query Interface

This document outlines the design and implementation of an LLM-powered natural language interface for the VidMetaStream system, allowing users to express complex video queries in plain English.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Natural Language Processing](#natural-language-processing)
- [Query Translation](#query-translation)
- [User Interface](#user-interface)
- [Implementation Plan](#implementation-plan)
- [Example Interactions](#example-interactions)

## Overview

The VidMetaStream Natural Language Query Interface will allow users to:

1. Express complex video queries in natural language
2. Receive visual results with relevant video segments
3. Refine queries through conversational interaction
4. View and play video chunks corresponding to query results

This approach eliminates the need for users to understand the underlying query structure or parameters, making the system more accessible and intuitive.

## Architecture

The system will follow a conversational AI architecture with the following components:

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Chat Input  │  │ Results View│  │ Video Player       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                   LLM Query Processing                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │Intent Parser│  │Query Builder│  │ Response Generator │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    VidMetaStream API                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │Query Service│  │Results Cache│  │ Video Chunk Service │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Natural Language Processing

### Intent Recognition

The system will use an LLM to identify the user's query intent, which broadly falls into these categories:

1. **Object Queries**: "Show me videos with people and cars"
2. **Spatial Queries**: "Find videos where people appear in the top-left corner"
3. **Temporal Queries**: "Show me videos with cars between 10 and 20 seconds"
4. **Sequence Queries**: "Find videos where a person appears followed by a car"
5. **Instance Queries**: "Show me videos with at least 3 people overlapping"
6. **Refinement Queries**: "Only show the ones from yesterday"
7. **Explanation Queries**: "Why did you show me this result?"

### Entity Extraction

The LLM will extract key entities from the user's query:

- **Objects**: person, car, bicycle, etc.
- **Spatial Areas**: top, bottom, left, right, center, coordinates
- **Temporal References**: timestamps, durations, "after", "before"
- **Counts**: number of instances, overlaps
- **Relationships**: "followed by", "together with", "overlapping"

### Context Management

The system will maintain conversation context to enable follow-up queries:

```
User: "Show me videos with people"
System: [Shows results]
User: "Now only the ones with cars too"
System: [Refines results to include both people and cars]
```

## Query Translation

### Natural Language to API Parameters

The LLM will translate natural language queries into structured API calls:

```javascript
// Example translation process
function translateQuery(naturalLanguageQuery, conversationContext) {
  // Use LLM to parse the query
  const parsedQuery = await llm.parse(naturalLanguageQuery, conversationContext);
  
  // Extract query type and parameters
  const { queryType, parameters } = parsedQuery;
  
  // Build the appropriate API call
  let apiEndpoint, apiParams;
  
  switch (queryType) {
    case 'OBJECT_QUERY':
      apiEndpoint = '/query/objects';
      apiParams = {
        objects: JSON.stringify(parameters.objects),
        window_size: parameters.windowSize || 0
      };
      break;
    case 'SPATIAL_QUERY':
      apiEndpoint = '/query/spatialObjects';
      apiParams = {
        objects: JSON.stringify(parameters.objects),
        area: parameters.area
      };
      break;
    case 'SEQUENCE_QUERY':
      apiEndpoint = '/query/tempral/objects';
      apiParams = {
        sequence: JSON.stringify(parameters.sequence),
        window_size: parameters.windowSize || 10
      };
      break;
    // Other query types...
  }
  
  return { apiEndpoint, apiParams };
}
```

### Handling Ambiguity

When queries are ambiguous, the LLM will:

1. Make reasonable assumptions based on context
2. Ask clarifying questions when necessary
3. Explain its interpretation to the user

```
User: "Show me videos with objects in the center"
System: "I'll look for videos with any objects in the center of the frame. Would you like to specify which objects you're interested in?"
```

### Query Optimization

The LLM will optimize queries for performance:

1. Selecting the most appropriate endpoint
2. Setting reasonable default values for optional parameters
3. Breaking complex queries into simpler sub-queries when beneficial

## User Interface

### Conversational Chat Interface

The primary interface will be a chat-like experience:

```
┌─────────────────────────────────────────────────────────────┐
│ VidMetaStream                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You: Show me videos with people followed by cars           │
│                                                             │
│  VidMetaStream: I found 3 videos where people appear        │
│  followed by cars within a 10-second window:                │
│                                                             │
│  [Video thumbnails with playback controls]                  │
│                                                             │
│  You: Only show the ones where they appear in the top half  │
│                                                             │
│  VidMetaStream: Here's 1 video where people appear followed │
│  by cars in the top half of the frame:                      │
│                                                             │
│  [Video thumbnail with playback controls]                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Ask a question about your videos...            [Send]      │
└─────────────────────────────────────────────────────────────┘
```

### Results Visualization

Query results will be displayed with:

1. Video thumbnails or preview frames
2. Highlighted objects matching the query
3. Timeline indicators showing when objects appear
4. Play buttons to start video playback

### Video Player Integration

The video player will:

1. Play the relevant segments from query results
2. Highlight objects in the video with bounding boxes
3. Show a timeline with object appearances marked
4. Allow users to navigate between result segments

### Explanation and Transparency

The system will explain its reasoning:

```
User: "Why did you show me this video?"
System: "This video matches your query for 'people followed by cars' because:
1. A person appears at 00:15
2. A car appears at 00:18, after the person
3. Both objects appear in sequence within a 10-second window"
```

## Implementation Plan

### Phase 1: LLM Integration

1. Set up LLM service (OpenAI API, Anthropic Claude, or self-hosted model)
2. Develop prompt engineering for query understanding
3. Create query translation layer
4. Implement conversation context management

### Phase 2: Natural Language Interface

1. Build chat-based UI
2. Implement query submission and response handling
3. Add support for follow-up questions and refinements
4. Create explanation generation for query interpretation

### Phase 3: Results Visualization

1. Develop visual presentation of query results
2. Implement video thumbnail generation
3. Create object highlighting in result previews
4. Build timeline visualization for object appearances

### Phase 4: Video Player Enhancement

1. Integrate video player with natural language interface
2. Implement object highlighting in video playback
3. Add support for navigating between query results
4. Create synchronized timeline with object markers

### Phase 5: Refinement and Optimization

1. Train the LLM on domain-specific examples
2. Optimize query translation for performance
3. Improve handling of ambiguous queries
4. Add support for more complex query patterns

## Example Interactions

### Basic Object Query

```
User: "Show me videos with people and cars"

System: "I found 5 videos containing both people and cars. Here they are:"
[Displays video thumbnails with highlighted people and cars]
```

### Sequence Query

```
User: "Find videos where a person appears and then a car drives by within 5 seconds"

System: "I found 2 videos where a person appears followed by a car within a 5-second window:"
[Displays video thumbnails with timeline showing the sequence]
```

### Spatial Query with Refinement

```
User: "Show me videos with people in the center of the frame"

System: "Here are 8 videos with people in the center area:"
[Displays video thumbnails with people highlighted in the center]

User: "Only show the ones where there are at least 3 people"

System: "I found 2 videos with at least 3 people in the center area:"
[Displays refined results]
```

### Complex Query

```
User: "Find videos where people are walking in the top half of the frame and then a car appears in the bottom half within 10 seconds"

System: "I'll search for that specific sequence. Let me break down how I understand your query:
- Looking for people in the top half of the frame
- Followed by cars in the bottom half
- Within a 10-second window

I found 1 video matching these criteria:"
[Displays video with visualization of the sequence]
```

### Query Explanation

```
User: "Why didn't you include the video from yesterday in the results?"

System: "The video from yesterday contains people and cars, but they don't appear in the sequence you specified. In that video, the car appears first at 00:12, and then people appear at 00:18, which is the reverse of the sequence you asked for."
```

## LLM Prompt Design

### Query Understanding Prompt

```
You are an AI assistant for the VidMetaStream video query system. Your task is to interpret natural language queries about video content and translate them into structured API calls.

The user's query is: "{user_query}"

Previous conversation context: {conversation_history}

Please analyze the query and extract:
1. Query type (Object, Spatial, Temporal, Sequence, Instance)
2. Objects mentioned (person, car, bicycle, etc.)
3. Spatial references (top, bottom, center, coordinates)
4. Temporal references (timestamps, durations)
5. Count requirements (number of instances)
6. Relationship requirements (followed by, together with)

Then, determine the appropriate API endpoint and parameters for this query.
```

### Response Generation Prompt

```
You are an AI assistant for the VidMetaStream video query system. Your task is to generate natural language responses to explain query results.

The user's query was: "{user_query}"
The query was interpreted as: {interpreted_query}
The API endpoint used was: {api_endpoint}
The parameters used were: {api_parameters}
The results are: {query_results}

Please generate a natural, conversational response that:
1. Confirms what was searched for
2. Summarizes the results (number of videos, key features)
3. Explains any assumptions or interpretations made
4. Suggests possible refinements if appropriate
```

This design provides a comprehensive framework for implementing an LLM-powered natural language interface for VidMetaStream, making the powerful query capabilities accessible through simple, conversational interaction. 