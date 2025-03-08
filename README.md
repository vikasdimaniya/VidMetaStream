# VidMetaStream

VidMetaStream is a sophisticated video processing and querying system that allows for complex analysis of video content based on object detection and temporal/spatial relationships.

## Recent Improvements

The codebase has undergone several improvements to enhance maintainability, performance, and developer experience:

### 1. Code Organization

- **Modular Architecture**: Refactored the monolithic query processor into smaller, more focused modules
- **Separation of Concerns**: Moved utility functions to dedicated files based on their purpose
- **Consistent Error Handling**: Implemented a centralized error handling mechanism with custom error classes

### 2. New Features

- **Structured Logging**: Added a comprehensive logging system with different log levels and file output
- **Input Validation**: Implemented robust input validation for API endpoints
- **Configuration Management**: Centralized configuration in a single file with environment variable support

### 3. Developer Experience

- **Better Documentation**: Added JSDoc comments to functions and classes
- **Code Consistency**: Standardized coding patterns across the codebase
- **Environment Variables**: Added .env.example file to document required environment variables

## Project Structure

```
src/
├── api/              # API handlers
├── db/               # Database connection and models
├── model/            # Data models
├── routes/           # API routes
├── schema/           # API schemas
├── services/         # External service integrations
└── utils/            # Utility functions
    ├── errors.js     # Custom error classes
    ├── logger.js     # Logging utility
    ├── spatial-utils.js # Spatial and time-related utilities
    └── validation.js # Input validation utilities
```

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env` and update the values
3. Install dependencies: `npm install`
4. Start the server: `npm start`

## API Endpoints

### Query Endpoints

- `GET /query/objects` - Query videos for objects
- `GET /query/spatialObjects` - Query for objects in specific areas
- `GET /query/spatialObjectsTemporal` - Query for objects in specific areas during a time range
- `GET /query/spatialObjectsAnd` - Query for objects that satisfy multiple spatial conditions
- `GET /query/queryDistinctInstances` - Query for distinct instances of objects
- `GET /query/queryInstanceOverlaps` - Query for overlaps of the same object class
- `GET /query/queryInstanceOverlapsInArea` - Query for overlaps of the same object class in a specific area
- `GET /query/queryInstancesAtTime` - Query for instances of objects at a specific time
- `GET /query/tempral/objects` - Query for sequences of objects appearing in order

### Video Endpoints

- `POST /query/chunks` - Get video chunks based on time windows
- `GET /query/chunk/download/:chunk_id` - Download a specific video chunk

## Environment Variables

See `.env.example` for a list of required environment variables.

## Future Improvements

- Add unit and integration tests
- Implement caching for frequently accessed queries
- Add authentication and authorization
- Implement rate limiting
- Add monitoring and alerting
