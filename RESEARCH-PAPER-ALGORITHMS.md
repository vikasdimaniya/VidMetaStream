# VidMetaStream: Video Query System
## Algorithms and Data Structures

**Date**: October 2025  
**System**: Video object detection and querying

---

## Abstract

This document describes the algorithms and data structures used in VidMetaStream, a video query system for finding objects in videos. The system uses different data structures for different types of queries: QuadTree for spatial queries, Interval Tree for temporal queries, and various algorithms for finding patterns in video data.

---

## 1. System Architecture Overview

### 1.1 Data Model

**Video Metadata**:
```javascript
{
  _id: ObjectId,
  title: String,
  filename: String,
  status: Enum['created', 'uploaded', 'analyzing', 'analyzed', ...],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Object Instance**:
```javascript
{
  _id: String,                    // Instance UUID
  video_id: String,               // Reference to video
  object_name: String,            // Object class (e.g., "person", "car")
  start_time: Number,             // Instance start time (seconds)
  end_time: Number,               // Instance end time (seconds)
  frame_count: Integer,           // Total frames in instance
  frames: [{                      // Frame-level detections
    frame: Integer,               // Frame number
    timestamp: String | Number,   // "HH:MM:SS.SSS" or numeric seconds
    // Optional full detection box if available
    bounding_box: [x1, y1, x2, y2],
    relative_position: [x, y],    // Normalized center position [0,1]
    confidence: Float             // Detection confidence [0,1]
  }]
}
```

### 1.2 Database Indexes

**Objects Collection (5 indexes)**:
```javascript
// Single-field indexes
{ object_name: 1 }                                    // B-tree, O(log N) lookup
{ video_id: 1 }                                       // B-tree, O(log N) lookup

// Compound indexes (order optimized for selectivity)
{ object_name: 1, video_id: 1 }                      // Object + video queries
{ object_name: 1, start_time: 1, end_time: 1 }       // Temporal range queries
{ video_id: 1, object_name: 1, start_time: 1 }       // Video-centric queries
```

**Videos Collection (2 indexes)**:
```javascript
{ status: 1, createdAt: -1 }     // Status filtering with recency sort
{ createdAt: -1 }                // Recency queries
```

**Why**: Compound indexes put the most specific fields first. This allows the database to quickly narrow down results when searching.

---

## 2. Core Query APIs

### 2.1 Spatial Query (OR Logic)

**API**: `GET /query/spatialObjects`

**Purpose**: Find all video segments where ANY specified object appears in a defined spatial region.

**Input**:
- `objects`: Array of object names (e.g., ["person", "car"])
- `area`: Spatial region definition (named halves/thirds/quadrants such as
  "top-left", "top-right", "bottom-left", "bottom-right",
  "top-half", "bottom-half", "left-half", "right-half",
  "top-third", "middle-third-horizontal", "bottom-third",
  "left-third", "middle-third-vertical", "right-third";
  or custom bbox [x1, y1, x2, y2])

**Algorithm (Threshold-Based QuadTree)**:
```
ALGORITHM: SpatialQueryOR(objects[], area)
INPUT: objects = [obj₁, obj₂, ..., objₘ], area = spatial region
OUTPUT: time_windows = [{video_id, object_name, windows[]}]

1. results ← []
2. FOR EACH object IN objects DO
3.   instances ← DB.find({object_name: object})     // O(log N) indexed
4.   FOR EACH instance IN instances DO
5.     frames ← instance.frames
6.     
7.     IF frames.length > THRESHOLD (100) THEN
8.       // Use QuadTree for large frame sets
9.       quadTree ← BuildQuadTree(frames)            // O(F)
10.      matchingFrames ← quadTree.query(area)       // O(k)
11.    ELSE
12.      // Linear scan for small frame sets
13.      matchingFrames ← LinearScan(frames, area)   // O(F)
14.    END IF
15.    
16.    windows ← BuildTimeWindows(matchingFrames)    // O(k)
17.    results.append({instance, windows})
18.  END FOR
19. END FOR
20. RETURN MergeWindows(results)                     // O(W log W)
```

**Data Structures Used**:
- **QuadTree**: A tree structure that divides 2D space into 4 quadrants recursively
  - **Why**: Instead of checking every frame (O(F) comparisons), we can skip entire regions that don't match by spatial pruning
  - **When Used**: Only when there are more than 100 frames (otherwise simple loop is faster due to tree building overhead)
  - **How It Works**: Divides the video frame into 4 parts recursively, up to 4 levels deep. Each node stores up to 10 objects before subdividing
  
**Complexity**:
- **Time**: 
  - Simple approach: Check all F frames = O(F) operations
  - With QuadTree: Build tree O(F) + Query O(k) operations (where k = number of results)
  - We use simple approach for small datasets (≤100 frames) and QuadTree for large datasets
- **Space**: O(F) memory needed for the tree (built per instance, then discarded)

**Database Optimization**: MongoDB B-tree indexes on `object_name`, `video_id`, and compound variants enable efficient lookups instead of scanning entire collections.

---

### 2.2 Spatial Query (AND Logic)

**API**: `GET /query/spatialObjectsAnd`

**Purpose**: Find video segments where ALL specified objects appear together in the spatial region.

**Algorithm**:
```
ALGORITHM: SpatialQueryAND(objects[], area)
INPUT: objects = [obj₁, obj₂, ..., objₘ], area = spatial region
OUTPUT: time_windows where ALL objects co-occur

1. individualResults ← []
2. FOR EACH object IN objects DO
3.   windows ← SpatialQueryOR([object], area)
4.   individualResults.append({object, windows})
5. END FOR
6.
7. // Find temporal intersections
8. intersection ← IntersectTimeWindows(individualResults)
9. RETURN intersection
```

**Algorithm Used**:
- **Interval Intersection**: Sort time intervals and find where they overlap
  - **Why**: Simple approach would be O(W²) - compare every interval with every other interval
  - **Our Approach**: Sort once O(W log W), then scan through to find overlaps

**Complexity**:
- **Time**: 
  - Simple approach: Compare every window pair = O(W²) operations
  - Our approach: Sort windows O(W log W) + find overlaps O(W) = O(W log W) total
- **Space**: O(O × W) - stores windows for each object type

---

### 2.3 Temporal Point Query

**API**: `GET /query/queryInstancesAtTime`

**Purpose**: Find all instances of an object active at a specific timestamp.

**Algorithm (Threshold-Based Interval Tree + Binary Search)**:
```
ALGORITHM: QueryInstancesAtTime(object_name, time)
INPUT: object_name, time (in seconds)
OUTPUT: instances = [{video_id, instance_id, frame_at_time}]

1. instances ← DB.find({object_name: object_name})   // O(log N) indexed
2. GroupByVideo(instances) → videoGroups              // O(I)
3. results ← []
4.
5. FOR EACH (video_id, instances) IN videoGroups DO
6.   IF instances.length ≥ THRESHOLD (20) THEN
7.     // Use Interval Tree for large instance sets
8.     tree ← intervalTreeCache.getOrBuild(video_id, instances)  // O(1) cached
9.     matches ← tree.queryPoint(time)                // O(log I + k)
10.  ELSE
11.    // Linear scan for small instance sets
12.    matches ← LinearFilter(instances, time)        // O(I)
13.  END IF
14.
15.  FOR EACH match IN matches DO
16.    // Binary search for closest frame
17.    frame ← BinarySearchFrame(match.frames, time)  // O(log F)
18.    results.append({match, frame})
19.  END FOR
20. END FOR
21. RETURN results
```

**Data Structures Used**:

1. **Interval Tree** (stored in memory):
   - **What**: A center-based tree that partitions time intervals into three groups (left, right, overlap) at each node
   - **Why**: Simple approach checks all I intervals = O(I) operations. Tree approach = O(log I + k) operations where k = number of matching intervals
   - **When Used**: Only when there are 20 or more instances per video (otherwise simple loop is faster due to tree building overhead)
   - **Memory**: Stored in RAM for up to 100 videos (reused across queries via LRU cache)

2. **Binary Search** (algorithm):
   - **What**: Search algorithm to find the closest frame to a target time
   - **Why**: Simple approach checks all F frames = O(F) operations. Binary search = O(log F) operations
   - **How**: Works like searching a phone book - check middle, then narrow down left or right half
   - **Requirement**: Frames must be sorted by time (which they are from video processing)

**Complexity**:
- **Time**:
  - Simple approach: Check all instances O(I) + check all frames O(F) = O(I × F) total
  - Our approach: 
    - For large datasets: Build tree O(I log I) once + query tree O(log I + k) + search frames O(log F) per match
    - For small datasets: Check instances O(I) + search frames O(log F) = O(I + log F)
- **Space**: 
  - Interval tree: O(I) memory per video
  - Maximum: 100 videos in cache = O(100I) bounded

**Database Optimization**: MongoDB index on `{object_name, start_time, end_time}` helps filter instances quickly at the database level.

---

### 2.4 Temporal Overlap Query

**API**: `GET /query/queryInstanceOverlaps`

**Purpose**: Find time periods where at least N instances of an object overlap.

**Algorithm (Sweep Line)**:
```
ALGORITHM: QueryInstanceOverlaps(object, count)
INPUT: object_name, count (minimum overlapping instances)
OUTPUT: time_periods = [{start_time, end_time, instances[]}]

1. instances ← DB.find({object_name: object})        // O(log N) indexed
2. events ← []
3.
4. // Create start and end events
5. FOR EACH instance IN instances DO
6.   events.append({time: instance.start_time, type: 'start', instance})
7.   events.append({time: instance.end_time, type: 'end', instance})
8. END FOR
9.
10. events.sort(by time, tie-break: end before start)  // O(I log I)
11.
12. activeSet ← ∅
13. overlaps ← []
14. currentOverlap ← NULL
15.
16. FOR EACH event IN events DO                      // O(I)
17.   IF event.type = 'start' THEN
18.     activeSet.add(event.instance)
19.     IF |activeSet| ≥ count AND currentOverlap = NULL THEN
20.       currentOverlap ← {start: event.time, instances: copy(activeSet)}
21.     END IF
22.   ELSE  // event.type = 'end'
23.     IF |activeSet| ≥ count AND currentOverlap ≠ NULL THEN
24.       currentOverlap.end ← event.time
25.       overlaps.append(currentOverlap)
26.       currentOverlap ← NULL
27.     END IF
28.     activeSet.remove(event.instance)
29.   END IF
30. END FOR
31.
32. RETURN MergeContiguousOverlaps(overlaps)         // O(O log O)
```

**Algorithm Used**:
- **Sweep Line Algorithm**:
  - **What**: Process time events in chronological order to find overlaps
  - **Why**: Simple approach compares every pair of intervals = O(I²) operations
  - **Our Approach**: Sort events once O(I log I), then scan through them O(I)
  - **How It Works**: Mark each instance's start and end time as "events", then process events in time order while tracking how many are currently active
  - **Tie-Breaking Rule**: When two events occur at the same time, process END events before START events to avoid counting instances that just touch at a boundary

**Complexity**:
- **Time**: 
  - Simple approach: Compare all interval pairs = O(I²) operations
  - Our approach: Sort events O(I log I) + scan events O(I) = O(I log I) total
- **Space**: O(I) for storing events

---

### 2.5 Sequential Appearance Query

**API**: `GET /query/temporal/objects` (alias supported: `/query/querySequence`)

**Purpose**: Find video segments where objects appear in a specified sequential order.

**Algorithm (Greedy Sequential Matching)**:
```
ALGORITHM: QuerySequence(sequence[], windowSize)
INPUT: sequence = [obj₁, obj₂, ..., objₘ], windowSize (seconds)
OUTPUT: matches = [{video_id, windows[{start, end, sequence_matches[]}]}]

1. groupedData ← {}
2.
3. // Fetch and group instances by video
4. FOR EACH object IN sequence DO
5.   instances ← DB.find({object_name: object})      // O(log N) indexed
6.   FOR EACH instance IN instances DO
7.     groupedData[instance.video_id].append(instance)
8.   END FOR
9. END FOR
10.
11. results ← []
12. FOR EACH (video_id, videoData) IN groupedData DO
13.   // Check all objects present
14.   IF NOT AllObjectsPresent(videoData, sequence) THEN
15.     CONTINUE
16.   END IF
17.   
18.   // Greedy matching: for each instance of first object, find closest match
19.   firstObjectInstances ← videoData[sequence[0]]
20.   FOR EACH firstInstance IN firstObjectInstances DO
21.     currentEnd ← firstInstance.end_time
22.     matchSequence ← [firstInstance]
23.     
24.     // Greedily match each subsequent object
25.     FOR i ← 1 TO sequence.length - 1 DO
26.       nextObject ← sequence[i]
27.       nextInstance ← FindClosestAfter(videoData[nextObject], currentEnd)
28.       
29.       IF nextInstance = NULL THEN
30.         BREAK  // Sequence broken
31.       END IF
32.       
33.       matchSequence.append(nextInstance)
34.       currentEnd ← nextInstance.end_time
35.     END FOR
36.     
37.     // Check if full sequence matched and within window size
38.     IF matchSequence.length = sequence.length THEN
39.       totalDuration ← currentEnd - firstInstance.start_time
40.       IF windowSize = 0 OR totalDuration ≤ windowSize THEN
41.         results.append({video_id, matchSequence})
42.       END IF
43.     END IF
44.   END FOR
45. END FOR
46. RETURN results
```

**Algorithm Used**:
- **Greedy Sequential Matching**:
  - **What**: For each instance of the first object, greedily find the closest subsequent instance of each next object in order
  - **Why**: Instead of checking all possible combinations O(I^m) where m=sequence length, we greedily select the closest match at each step
  - **How It Works**: Start with each instance of first object, then for each subsequent object in sequence, find the nearest instance that starts after the previous one ends
  - **Ordering Rule**: Each next object must START after (or when) the previous object ENDS

**Complexity**:
- **Time**: 
  - Fetch and group by video: O(M × N) where M=sequence length, N=avg instances per object
  - Per video: O(I₁ × M × I₂) where I₁=instances of first object, I₂=avg instances per other objects, M=sequence length
  - With sorted data: O(M × N log N) fetch + O(I₁ × M × log I₂) matching
- **Space**: O(V × I) - stores instances grouped by video and object type

---

### 2.6 Temporal Window Filter

**API**: Internal utility used by spatial queries

**Purpose**: Filter spatial results to specific temporal windows.

**Algorithm**:
```
ALGORITHM: FilterByTimeWindow(results, startTime, endTime)
INPUT: results with time_windows[], startTime, endTime
OUTPUT: filtered results within [startTime, endTime]

1. FOR EACH result IN results DO
2.   filteredWindows ← []
3.   FOR EACH window IN result.windows DO
4.     overlap ← ComputeOverlap(window, [startTime, endTime])
5.     IF overlap ≠ ∅ THEN
6.       filteredWindows.append(overlap)
7.     END IF
8.   END FOR
9.   result.windows ← filteredWindows
10. END FOR
11. RETURN results
```

**Complexity**:
- **Time**: O(R × W) where R = results, W = windows per result
- **Space**: O(R × W) for filtered output

---

## 3. Advanced Optimizations

### 3.1 LRU Query Result Cache

**Purpose**: Store recent query results so we don't have to recompute them.

**How It Works**:
```
CLASS LRUCache(capacity, maxSize=100MB, ttl=1hour):
  cache: Map<key, {value, timestamp, size}>
  keys: Array (LRU order)
  
  FUNCTION query(queryType, params, computeFn):
    key ← generateKey(queryType, normalizeParams(params))
    
    IF cache.has(key) AND notExpired(cache[key]) THEN
      moveToEnd(key)                    // Update LRU
      RETURN cache[key].value           // Cache HIT
    END IF
    
    result ← computeFn()                // Cache MISS
    size ← estimateSize(result)
    
    IF size > maxSize THEN
      RETURN result                     // Don't cache oversized
    END IF
    
    evictToFitSize(size)                // Make space
    cache[key] ← {value: result, timestamp: now(), size}
    keys.append(key)
    
    RETURN result
```

**Key Features**:
- **Hash Map**: Stores query results with their parameters as the key
- **LRU Eviction**: When cache is full, removes the least recently used item
- **Size Limit**: Maximum 100 MB of cached results
- **TTL**: Cached results expire after 1 hour
- **Invalidation**: Manual invalidation endpoints are provided (invalidate entries by video or object); entries also expire by TTL.

**Complexity**:
- **Time**: 
  - Cache hit (result found): O(1) - instant return
  - Cache miss (need to compute): O(original query time)
- **Space**: Maximum 100 MB

**Comparison to No Cache**:
- Without cache: Every identical query takes full computation time
- With cache: Repeated queries return in O(1) time if cached

---

### 3.2 QuadTree (Spatial Search)

**Purpose**: Find objects in specific regions of the video frame quickly.

**Structure**:
```
CLASS QuadTreeNode:
  bounds: {x, y, width, height}
  children: [TR, TL, BL, BR] or NULL  // Top-right, Top-left, Bottom-left, Bottom-right
  objects: [frame_indices]
  maxObjects: 10      // Split when exceeding 10 objects per node
  maxLevels: 4        // Maximum tree depth is 4 levels
  level: Integer      // Current depth level
```

**Operations**:
```
FUNCTION BuildQuadTree(frames):
  root ← new QuadTreeNode(bounds=[0,0,1,1])
  FOR EACH (frame, index) IN frames DO
    Insert(root, frame.relative_position, index, depth=0)
  END FOR
  RETURN root

FUNCTION Insert(node, bbox, data):
  // If we have subdivisions, try to insert into them
  IF node.children.length > 0 THEN
    quadrant ← GetQuadrant(node, bbox)
    IF quadrant ≠ -1 THEN
      Insert(node.children[quadrant], bbox, data)
      RETURN
    END IF
  END IF
  
  // Add to current node
  node.objects.append({bbox, data})
  
  // Check if we need to split
  IF node.objects.length > maxObjects AND node.level < maxLevels THEN
    IF node.children.length = 0 THEN
      Subdivide(node)  // Create 4 child nodes
    END IF
    
    // Redistribute objects to children
    FOR EACH obj IN node.objects DO
      quadrant ← GetQuadrant(node, obj.bbox)
      IF quadrant ≠ -1 THEN
        Insert(node.children[quadrant], obj.bbox, obj.data)
        Remove obj from node.objects
      END IF
    END FOR
  END IF

FUNCTION Query(node, area):
  IF NOT Intersects(node.bounds, area) THEN
    RETURN []
  END IF
  
  IF node.isLeaf() THEN
    RETURN FilterByArea(node.objects, area)
  END IF
  
  results ← []
  FOR EACH child IN node.children DO
    results.extend(Query(child, area))
  END FOR
  RETURN results
```

**Complexity**:
- **Build**: O(F) operations to build the tree (each frame inserted once, constant depth)
- **Query**: 
  - Simple approach: Check all F frames = O(F)
  - QuadTree: O(k) where k = number of matching frames (returns only relevant results)
- **Space**: O(F) memory for the tree

**Why Use QuadTree**:
- **Pruning**: Can skip entire regions of the frame that don't match the query
- **Example**: Looking for objects in top-left? Skip checking the bottom-right quadrant entirely
- **Fixed Depth**: With maxLevels=4, tree height is bounded, making operations effectively constant per level
- **When Used**: Only for large datasets (>100 frames) - otherwise the build cost isn't worth it
- **Note on Spatial Semantics**: Current spatial search primarily uses normalized center positions (`relative_position`). For QuadTree queries, small artificial bounding boxes around centers are used to approximate spatial inclusion; when full per-frame detection boxes are available, they can replace the approximation for higher precision.

---

### 3.3 Interval Tree (Time-Based Search)

**Purpose**: Find which object instances are active at a specific time.

**Structure**:
```
CLASS IntervalTreeNode:
  center: Float         // Center point for partitioning
  intervals: {
    left: [],          // Intervals completely left of center
    right: [],         // Intervals completely right of center
    overlap: []        // Intervals that overlap with center (sorted by start)
  }
  left: Node or NULL   // Left subtree (handles intervals ending before center)
  right: Node or NULL  // Right subtree (handles intervals starting after center)
```

**Operations**:
```
FUNCTION BuildIntervalTree(intervals):
  IF intervals.isEmpty() THEN RETURN NULL
  
  // Find median of all interval endpoints as center
  allPoints ← []
  FOR EACH interval IN intervals DO
    allPoints.append(interval.start, interval.end)
  END FOR
  allPoints.sort()
  center ← allPoints[allPoints.length / 2]
  
  node ← new IntervalTreeNode(center)
  leftIntervals ← []
  rightIntervals ← []
  
  // Partition intervals into three groups
  FOR EACH interval IN intervals DO
    IF interval.end < center THEN
      leftIntervals.append(interval)
      node.intervals.left.append(interval)
    ELSE IF interval.start > center THEN
      rightIntervals.append(interval)
      node.intervals.right.append(interval)
    ELSE
      node.intervals.overlap.append(interval)  // Overlaps with center
    END IF
  END FOR
  
  // Sort overlapping intervals by start time for efficient querying
  node.intervals.overlap.sort(by start_time)
  
  // Recursively build subtrees
  node.left ← BuildIntervalTree(leftIntervals)
  node.right ← BuildIntervalTree(rightIntervals)
  
  RETURN node

FUNCTION QueryPoint(node, time):
  IF node = NULL THEN RETURN []
  
  results ← []
  
  // Check intervals overlapping with center
  FOR EACH interval IN node.intervals.overlap DO
    IF interval.start ≤ time ≤ interval.end THEN
      results.append(interval.data)
    ELSE IF interval.start > time THEN
      BREAK  // Early exit (sorted by start time)
    END IF
  END FOR
  
  // Recursively search left or right subtree based on query point
  IF time < node.center THEN
    results.extend(QueryPoint(node.left, time))
  ELSE IF time > node.center THEN
    results.extend(QueryPoint(node.right, time))
  END IF
  
  RETURN results
```

**Complexity**:
- **Build**: O(I log I) operations to build the tree (sorting endpoints and partitioning)
- **Query**: 
  - Simple approach: Check all I instances = O(I)
  - Interval Tree: O(log I + k) where k = number of matching intervals
    - O(log I) for traversing tree height
    - O(k) for returning k matching results
- **Space**: O(I) memory for the tree

**Why Use Interval Tree**:
- **Pruning**: Can skip entire branches based on center point comparison
- **Example**: If querying time=10 and center=50, skip the right subtree entirely
- **Sorted Overlaps**: Intervals overlapping with center are sorted by start time, allowing early termination
- **When Used**: Only for large datasets (≥20 instances per video)
- **Caching**: Trees are kept in memory (LRU cache, up to 100 videos) to avoid rebuilding

---

## 4. Summary Table

| Query Type | Simple Approach | Our Approach | Data Structures Used |
|------------|----------------|--------------|----------------------|
| **Find objects in area** | O(F) per instance | O(F) build + O(k) query | QuadTree, Cache |
| **Find all objects in area** | O(W²) compare windows | O(W log W) sort + scan | Time Window Intersection |
| **Find instances at time** | O(I × F) check all | O(I log I) build + O(log I + k) query + O(log F) per match | Interval Tree, Binary Search, Cache |
| **Find overlapping instances** | O(I²) compare pairs | O(I log I) sort + scan | Sweep Line |
| **Find sequence pattern** | O(I^m) all combinations | O(M × N log N) + O(I₁ × M × log I₂) | Greedy Sequential Matching |

**What the variables mean**:
- F = number of frames in an instance
- I = number of object instances
- k = number of results returned
- W = number of time windows
- M = length of sequence pattern
- N = average number of instances per object
- I₁ = instances of first object in sequence
- I₂ = average instances of subsequent objects
- O(X) = "proportional to X" - if X doubles, time roughly doubles

---

## 5. When to Use Each Data Structure

We don't always use complex data structures. Sometimes a simple loop is faster! The system uses **threshold-based selection** to choose the right approach.

**QuadTree (Spatial Search)**: Use when > 100 frames
- **Why 100?** Building the tree takes time (subdividing space, inserting objects). For small datasets, a simple loop is faster
- **Below 100 frames**: Just check each frame (simple loop, O(F))
- **Above 100 frames**: Build and use QuadTree (O(F) build + O(k) query)
- **Note**: QuadTree is built per instance, not cached (discarded after query)

**Interval Tree (Time Search)**: Use when ≥ 20 instances per video
- **Why 20?** Building the tree has overhead (sorting endpoints, partitioning intervals)
- **Below 20 instances**: Just check each instance (simple loop, O(I))
- **20+ instances**: Build and use Interval Tree (O(I log I) build once, O(log I + k) per query)
- **Note**: Interval trees ARE cached (LRU, up to 100 videos) for reuse

**Binary Search**: Always use (no threshold)
- **Why always?** Binary search has almost no overhead, so it's always worth it
- Works on the sorted frames array without building any structure
- O(log F) is much better than O(F) linear scan

**Decision Logic**:
```
IF searching by location AND frames > 100:
    Use QuadTree
ELSE:
    Use simple loop

IF searching by time AND instances >= 20 per video:
    Use Interval Tree (with caching)
ELSE:
    Use simple loop

For frame lookups:
    Always use Binary Search
```

---

## 6. MongoDB Database Indexes

**What are indexes?** Like an index in a book - helps find information quickly without reading every page.

**How they work**:
- Without index: Check all N documents = O(N) operations
- With B-tree index: Jump to relevant section = O(log N) operations

**Example**:
```
Without index:
  Find all "person" instances in 100,000 documents
  = Check all 100,000 documents
  = O(N) = O(100,000)

With index:
  Find all "person" instances in 100,000 documents  
  = Use index to jump to "person" section
  = O(log N) = O(log 100,000) ≈ 17 comparisons
```

**Our Indexes**:
- `{object_name: 1}` - Find by object type quickly
- `{video_id: 1}` - Find by video quickly
- `{object_name: 1, video_id: 1}` - Find by object in specific video
- `{object_name: 1, start_time: 1, end_time: 1}` - Find by object in time range

**Why this order?** Most specific fields come first (object_name is more specific than video_id).

---

## 7. Summary

This document describes the data structures and algorithms used in VidMetaStream for efficient video querying.

**Key Techniques**:

1. **Threshold-Based Algorithm Selection**: Choose simple loops for small data, complex structures for large data
2. **Spatial Indexing**: QuadTree for finding objects in specific areas (when >100 frames per instance)
3. **Temporal Indexing**: Center-based Interval Tree for finding objects at specific times (when ≥20 instances per video)  
4. **Binary Search**: Find closest frame to a target time (always used for O(log F) lookup)
5. **Sweep Line Algorithm**: Find overlapping time periods efficiently in O(I log I) time
6. **Greedy Sequential Matching**: Find sequential object patterns without exhaustive search
7. **Result Caching**: LRU cache stores recent query results (100 MB limit, 100 entry capacity). Entries expire after 1 hour (TTL). Manual invalidation endpoints are provided (invalidate by video or object); automatic invalidation via hooks can be added as needed.
8. **Database Indexes**: MongoDB B-tree indexes for fast O(log N) lookups

**Memory Usage**:
- Interval Tree cache: LRU cache with capacity for 100 videos (approximately 1-2 MB per video tree)
- Result cache: Up to 100 MB (stores query results with LRU eviction)
- QuadTree: Built per instance per query, then discarded (not kept in memory)
- Total persistent memory: ~100-200 MB bounded

**Comparison to Simple Approaches**:
| Task | Simple Way | Our Way |
|------|-----------|---------|
| Find objects in area | Check all frames O(F) | QuadTree O(F) build + O(k) query |
| Find objects at time | Check all instances O(I) | Interval Tree O(I log I) build + O(log I + k) query |
| Find closest frame | Check all frames O(F) | Binary Search O(log F) |
| Find overlaps | Compare all pairs O(I²) | Sweep Line O(I log I) |
| Find sequence pattern | Check all combinations O(I^m) | Greedy Matching O(I₁ × M × log I₂) |

---

## References

- **QuadTree**: Finkel & Bentley (1974). "Quad trees: A data structure for retrieval on composite keys"
- **Interval Tree**: Cormen et al. (2009). "Introduction to Algorithms" (3rd ed.)
- **MongoDB Indexes**: MongoDB Documentation - https://docs.mongodb.com/manual/indexes/

