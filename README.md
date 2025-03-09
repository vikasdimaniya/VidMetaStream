# VidMetaStream

VidMetaStream is a powerful video metadata querying system that allows you to search and analyze video content based on objects, spatial relationships, temporal sequences, and more.

## Table of Contents

- [Introduction](#introduction)
- [API Endpoints](#api-endpoints)
  - [Object Queries](#object-queries)
  - [Spatial Queries](#spatial-queries)
  - [Temporal Queries](#temporal-queries)
  - [Sequence Queries](#sequence-queries)
  - [Instance Queries](#instance-queries)
  - [Video Chunk Queries](#video-chunk-queries)
- [Query Parameters](#query-parameters)
- [Response Formats](#response-formats)
- [Examples](#examples)

## Introduction

VidMetaStream provides a comprehensive API for querying video metadata. The system allows you to:

- Find objects in videos
- Search for objects in specific spatial areas
- Query for temporal relationships between objects
- Find sequences of objects appearing in order
- Analyze object instances and their overlaps
- Extract video chunks based on query results

## API Endpoints

### Object Queries

#### GET /query/objects

Retrieves videos containing specific objects.

**How it works:**
1. The endpoint accepts a list of object names to search for
2. It queries the database for videos containing these objects
3. Returns a list of videos with metadata about the objects found

**Parameters:**
- `objects`: JSON array of object names (e.g., `["person", "car"]`)
- `window_size` (optional): Time window size in seconds

**Example:**
```
GET /query/objects?objects=["person","car"]&window_size=10
```

### Spatial Queries

#### GET /query/spatialObjects

Finds objects within specific spatial areas in videos.

**How it works:**
1. The endpoint accepts a list of object names and a spatial area
2. It queries the database for objects that appear within the specified area
3. Returns videos and timestamps where the objects appear in the area

**Parameters:**
- `objects`: JSON array of object names (e.g., `["person", "car"]`)
- `area`: JSON array defining the area coordinates or a named area

**Example:**
```
GET /query/spatialObjects?objects=["person"]&area=[[0,0],[0,1],[1,1],[1,0]]
```

#### GET /query/spatialObjectsAnd

Similar to spatialObjects but requires ALL objects to be present in the area simultaneously.

**How it works:**
1. The endpoint accepts a list of object names and a spatial area
2. It finds instances where all specified objects appear in the area at the same time
3. Returns videos and time windows where this condition is met

**Parameters:**
- `objects`: JSON array of object names (e.g., `["person", "car"]`)
- `area`: JSON array defining the area coordinates or a named area

**Example:**
```
GET /query/spatialObjectsAnd?objects=["person","car"]&area=[[0,0],[0,1],[1,1],[1,0]]
```

### Temporal Queries

#### GET /query/spatialObjectsTemporal

Finds objects within specific spatial areas during a specific time window.

**How it works:**
1. The endpoint accepts object names, an area, and a time range
2. It queries for objects that appear in the area during the specified time window
3. Returns videos and timestamps where the conditions are met

**Parameters:**
- `objects`: JSON array of object names
- `area`: JSON array defining the area coordinates or a named area
- `start_time`: Start time in seconds
- `end_time`: End time in seconds

**Example:**
```
GET /query/spatialObjectsTemporal?objects=["person"]&area=[[0,0],[0,1],[1,1],[1,0]]&start_time=10&end_time=20
```

#### GET /query/queryInstancesAtTime

Finds instances of objects at a specific timestamp.

**How it works:**
1. The endpoint accepts an object name and a timestamp
2. It queries for instances of the object at the exact timestamp
3. Returns all instances found at that time

**Parameters:**
- `object`: Object name (e.g., "person")
- `time`: Timestamp in seconds

**Example:**
```
GET /query/queryInstancesAtTime?object=person&time=15.5
```

### Sequence Queries

#### GET /query/tempral/objects

Finds sequences of objects appearing in order within a time window.

**How it works:**
1. The endpoint accepts a sequence of object names and a maximum window size
2. It searches for instances where the objects appear in the specified order
3. Each subsequent object must start after the previous object ends
4. The total time span must be within the specified window size
5. Returns videos and time windows where the sequence is found

**Parameters:**
- `sequence`: JSON array of object names in order (e.g., `["person", "car"]`)
- `window_size` (optional): Maximum time window in seconds

**Example:**
```
GET /query/tempral/objects?sequence=["person","car"]&window_size=10
```

### Instance Queries

#### GET /query/queryDistinctInstances

Retrieves distinct instances of a specific object.

**How it works:**
1. The endpoint accepts an object name
2. It queries for all distinct instances of the object across videos
3. Returns a list of instances with their metadata

**Parameters:**
- `object`: Object name (e.g., "person")

**Example:**
```
GET /query/queryDistinctInstances?object=person
```

#### GET /query/queryInstanceOverlaps

Finds overlaps between instances of the same object type.

**How it works:**
1. The endpoint accepts an object name and a count
2. It searches for situations where the specified number of instances of the object overlap in time
3. Returns videos and time windows where the overlaps occur

**Parameters:**
- `object`: Object name (e.g., "person")
- `count`: Minimum number of overlapping instances (integer ≥ 2)

**Example:**
```
GET /query/queryInstanceOverlaps?object=person&count=3
```

#### GET /query/queryInstanceOverlapsInArea

Finds overlaps between instances of the same object type within a specific area.

**How it works:**
1. The endpoint accepts an object name, a count, and an area
2. It searches for situations where the specified number of instances of the object overlap in time and are within the area
3. Returns videos and time windows where these conditions are met

**Parameters:**
- `object`: Object name (e.g., "person")
- `count`: Minimum number of overlapping instances (integer ≥ 2)
- `area`: JSON array defining the area coordinates or a named area

**Example:**
```
GET /query/queryInstanceOverlapsInArea?object=person&count=2&area=[[0,0],[0,1],[1,1],[1,0]]
```

### Video Chunk Queries

#### POST /query/chunks

Retrieves video chunks based on specified time windows.

**How it works:**
1. The endpoint accepts a list of videos and time windows
2. It extracts the video chunks corresponding to the specified windows
3. Returns metadata about the chunks that can be downloaded

**Parameters:**
- `videos`: JSON array of objects containing video_id and windows

**Example:**
```
POST /query/chunks
{
  "videos": [
    {
      "video_id": "67ccd7f9653aa62e8e33ee29",
      "windows": [
        {
          "start_time": "00:00:10.000",
          "end_time": "00:00:20.000"
        }
      ]
    }
  ]
}
```

#### GET /query/chunk/download/:chunk_id

Downloads a specific video chunk.

**How it works:**
1. The endpoint accepts a chunk ID
2. It retrieves the video chunk from storage
3. Returns the video chunk file for download

**Parameters:**
- `chunk_id`: ID of the chunk to download (path parameter)

**Example:**
```
GET /query/chunk/download/abc123def456
```

## Query Parameters

### Objects Parameter

The `objects` parameter accepts a JSON array of object names. Examples include:
- `["person"]` - Single object
- `["person", "car"]` - Multiple objects
- `"person"` - Single object as string (will be converted to array)

### Area Parameter

The `area` parameter defines a spatial region and can be specified in two ways:
1. As a JSON array of coordinates defining a polygon: `[[x1,y1], [x2,y2], ...]`
2. As a named area: `"center"`, `"top"`, `"bottom"`, `"left"`, `"right"`, etc.

### Sequence Parameter

The `sequence` parameter defines an ordered list of objects to search for in sequence:
- `["person", "car"]` - Find instances where a person appears, followed by a car
- `["car", "person", "bicycle"]` - Find instances where a car appears, followed by a person, followed by a bicycle

### Window Size Parameter

The `window_size` parameter defines the maximum time span (in seconds) for:
- Object sequences in the `tempral/objects` endpoint
- Object co-occurrences in the `objects` endpoint

## Response Formats

Responses are returned in JSON format and typically include:

- Status code (200 for success)
- Data array containing matching results
- For object queries: video_id, object_name, and frames
- For sequence queries: video_id and time windows
- For spatial queries: video_id, object_name, and coordinates

## Examples

### Finding a Person Followed by a Car

```
GET /query/tempral/objects?sequence=["person","car"]&window_size=10
```

Response:
```json
[
  {
    "video_id": "67ccd7f9653aa62e8e33ee29",
    "windows": [
      {
        "start_time": "00:01:15.200",
        "end_time": "00:01:22.800"
      }
    ]
  }
]
```

### Finding People in the Center of the Frame

```
GET /query/spatialObjects?objects=["person"]&area="center"
```

Response:
```json
[
  {
    "video_id": "67ccd7f9653aa62e8e33ee29",
    "object_name": "person",
    "frames": [
      {
        "frame_id": 120,
        "timestamp": 4.0,
        "bbox": [0.4, 0.4, 0.6, 0.6]
      }
    ]
  }
]
```

### Finding Overlapping Instances of People

```
GET /query/queryInstanceOverlaps?object=person&count=3
```

Response:
```json
[
  {
    "video_id": "67ccd7f9653aa62e8e33ee29",
    "success_intervals": [
      {
        "start": "00:00:15.000",
        "end": "00:00:18.500"
      }
    ]
  }
]
```
