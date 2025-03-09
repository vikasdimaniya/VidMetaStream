# VidMetaStream Algorithms

This document provides a detailed explanation of the algorithms and implementation details behind each query type in the VidMetaStream system.

## Table of Contents

- [Object Queries](#object-queries)
- [Spatial Queries](#spatial-queries)
- [Temporal Queries](#temporal-queries)
- [Sequence Queries](#sequence-queries)
- [Instance Queries](#instance-queries)
- [Video Chunk Processing](#video-chunk-processing)
- [Optimization Techniques](#optimization-techniques)

## Object Queries

### Basic Object Query Algorithm

The basic object query (`/query/objects`) uses the following algorithm:

1. **Input Parsing**:
   - Parse the `objects` parameter into an array of object names
   - Parse the optional `window_size` parameter

2. **Database Query**:
   ```pseudocode
   function queryObjects(objects, windowSize):
     results = []
     
     // Query the database for videos containing the objects
     videoIds = getVideosContainingObjects(objects)
     
     for each videoId in videoIds:
       objectInstances = {}
       
       // Get instances of each object in the video
       for each object in objects:
         objectInstances[object] = getObjectInstances(videoId, object)
       
       // If window_size is specified, find co-occurrences
       if windowSize > 0:
         timeWindows = findCoOccurrenceWindows(objectInstances, windowSize)
         
         // Filter object instances to those within the time windows
         for each object in objects:
           objectInstances[object] = filterInstancesByWindows(objectInstances[object], timeWindows)
       
       // Add to results
       results.push({
         video_id: videoId,
         objects: objectInstances
       })
     
     return results
   ```

3. **Co-occurrence Detection**:
   When a `window_size` is specified, the algorithm finds time windows where all objects appear within the specified duration:
   ```pseudocode
   function findCoOccurrenceWindows(objectInstances, windowSize):
     windows = []
     
     // Get all start and end times
     events = []
     for each object, instances in objectInstances:
       for each instance in instances:
         events.push({time: instance.start_time, type: "start", object: object})
         events.push({time: instance.end_time, type: "end", object: object})
     
     // Sort events by time
     sort events by time
     
     // Sweep line algorithm to find windows
     activeObjects = {}
     for each event in events:
       if event.type == "start":
         activeObjects[event.object] = (activeObjects[event.object] || 0) + 1
         
         // Check if all objects are active
         if all objects in objectInstances have activeObjects[object] > 0:
           windowStart = event.time
           
           // Find the earliest end time
           earliestEnd = findEarliestEndTime(events, event.time)
           
           // If window size is within limit, add to windows
           if earliestEnd - windowStart <= windowSize:
             windows.push({start: windowStart, end: earliestEnd})
       
       else if event.type == "end":
         activeObjects[event.object] = activeObjects[event.object] - 1
     
     return mergeOverlappingWindows(windows)
   ```

4. **Time Complexity**:
   - Without window_size: O(n) where n is the number of object instances
   - With window_size: O(n log n) due to the sorting of events in the sweep line algorithm

## Spatial Queries

### Spatial Query Algorithm

The spatial query algorithms (`/query/spatialObjects` and `/query/spatialObjectsAnd`) use spatial indexing for efficient area-based searches:

1. **Area Interpretation**:
   ```pseudocode
   function interpretArea(area):
     if area is a string (e.g., "center", "top"):
       return predefinedArea(area)
     else:
       return parsePolygon(area)
   ```

2. **Spatial Object Query**:
   ```pseudocode
   function querySpatialObjects(objects, area):
     results = []
     
     // Parse the area
     parsedArea = interpretArea(area)
     
     // Query the database for videos containing the objects
     videoIds = getVideosContainingObjects(objects)
     
     for each videoId in videoIds:
       videoResults = []
       
       for each object in objects:
         // Get instances of the object in the video
         instances = getObjectInstances(videoId, object)
         
         // Filter instances by spatial area
         filteredInstances = []
         for each instance in instances:
           for each frame in instance.frames:
             if isInArea(frame.bbox, parsedArea):
               filteredInstances.push({
                 frame_id: frame.frame_id,
                 timestamp: frame.timestamp,
                 bbox: frame.bbox
               })
         
         if filteredInstances.length > 0:
           videoResults.push({
             object_name: object,
             frames: filteredInstances
           })
       
       if videoResults.length > 0:
         results.push({
           video_id: videoId,
           objects: videoResults
         })
     
     return results
   ```

3. **Spatial AND Query**:
   ```pseudocode
   function querySpatialObjectsAnd(objects, area):
     results = []
     
     // Parse the area
     parsedArea = interpretArea(area)
     
     // Query the database for videos containing all objects
     videoIds = getVideosContainingAllObjects(objects)
     
     for each videoId in videoIds:
       // Get all frames for each object
       objectFrames = {}
       for each object in objects:
         instances = getObjectInstances(videoId, object)
         objectFrames[object] = extractFramesInArea(instances, parsedArea)
       
       // Find time windows where all objects appear in the area
       timeWindows = findTimeWindowsWithAllObjects(objectFrames)
       
       if timeWindows.length > 0:
         results.push({
           video_id: videoId,
           windows: timeWindows
         })
     
     return results
   ```

4. **Spatial Indexing**:
   The system uses a QuadTree data structure for efficient spatial queries:
   ```pseudocode
   function buildQuadTree(frames):
     // Create a quadtree with the video dimensions
     quadtree = new QuadTree(0, 0, 1, 1)
     
     // Insert each frame's bounding box
     for each frame in frames:
       quadtree.insert(frame.bbox, frame)
     
     return quadtree
   
   function queryQuadTree(quadtree, area):
     // Query the quadtree for all frames in the area
     return quadtree.query(area)
   ```

5. **Time Complexity**:
   - Building the QuadTree: O(n log n) where n is the number of frames
   - Querying the QuadTree: O(log n + k) where k is the number of results

## Temporal Queries

### Temporal Query Algorithm

The temporal query algorithm (`/query/spatialObjectsTemporal`) combines spatial and temporal filtering:

1. **Algorithm**:
   ```pseudocode
   function querySpatialObjectsTemporal(objects, area, startTime, endTime):
     results = []
     
     // Parse the area
     parsedArea = interpretArea(area)
     
     // Query the database for videos containing the objects
     videoIds = getVideosContainingObjects(objects)
     
     for each videoId in videoIds:
       videoResults = []
       
       for each object in objects:
         // Get instances of the object in the video
         instances = getObjectInstances(videoId, object)
         
         // Filter instances by time range
         timeFilteredInstances = filterInstancesByTimeRange(instances, startTime, endTime)
         
         // Filter instances by spatial area
         areaFilteredInstances = []
         for each instance in timeFilteredInstances:
           for each frame in instance.frames:
             if isInArea(frame.bbox, parsedArea) && 
                frame.timestamp >= startTime && 
                frame.timestamp <= endTime:
               areaFilteredInstances.push({
                 frame_id: frame.frame_id,
                 timestamp: frame.timestamp,
                 bbox: frame.bbox
               })
         
         if areaFilteredInstances.length > 0:
           videoResults.push({
             object_name: object,
             frames: areaFilteredInstances
           })
       
       if videoResults.length > 0:
         results.push({
           video_id: videoId,
           objects: videoResults
         })
     
     return results
   ```

2. **Temporal Indexing**:
   The system uses an Interval Tree for efficient temporal queries:
   ```pseudocode
   function buildIntervalTree(instances):
     // Create an interval tree
     intervalTree = new IntervalTree()
     
     // Insert each instance's time range
     for each instance in instances:
       intervalTree.insert(instance.start_time, instance.end_time, instance)
     
     return intervalTree
   
   function queryIntervalTree(intervalTree, startTime, endTime):
     // Query the interval tree for all instances overlapping the time range
     return intervalTree.queryOverlap(startTime, endTime)
   ```

3. **Time Complexity**:
   - Building the Interval Tree: O(n log n) where n is the number of instances
   - Querying the Interval Tree: O(log n + k) where k is the number of results

### Instances at Time Query

The algorithm for finding instances at a specific time (`/query/queryInstancesAtTime`):

```pseudocode
function queryInstancesAtTime(object, time):
  results = []
  
  // Query the database for videos containing the object
  videoIds = getVideosContainingObject(object)
  
  for each videoId in videoIds:
    // Get instances of the object in the video
    instances = getObjectInstances(videoId, object)
    
    // Filter instances by time
    matchingInstances = []
    for each instance in instances:
      if instance.start_time <= time && instance.end_time >= time:
        // Find the specific frame closest to the time
        closestFrame = findClosestFrame(instance.frames, time)
        matchingInstances.push({
          instance_id: instance.id,
          frame: closestFrame
        })
    
    if matchingInstances.length > 0:
      results.push({
        video_id: videoId,
        instances: matchingInstances
      })
  
  return results
```

## Sequence Queries

### Sequence Query Algorithm

The sequence query algorithm (`/query/tempral/objects`) finds sequences of objects appearing in order:

1. **Algorithm**:
   ```pseudocode
   function querySequence(sequence, windowSize):
     results = []
     
     // Get data for all objects in the sequence
     objectData = getObjectData(sequence)
     
     // Organize object data by video_id and object_name
     videoObjects = {}
     for each object in objectData:
       videoId = object.video_id
       objectName = object.object_name
       
       if videoObjects[videoId] doesn't exist:
         videoObjects[videoId] = {}
       
       if videoObjects[videoId][objectName] doesn't exist:
         videoObjects[videoId][objectName] = []
       
       videoObjects[videoId][objectName].push({
         start_time: object.start_time,
         end_time: object.end_time
       })
     
     // Find sequences in each video
     for each videoId, videoData in videoObjects:
       // Check if all objects in the sequence are present in this video
       if all objects in sequence exist in videoData:
         // Find sequences where objects appear in order
         sequenceWindows = findSequentialAppearances(videoData, sequence, windowSize)
         
         if sequenceWindows.length > 0:
           results.push({
             video_id: videoId,
             windows: formatTimeWindows(sequenceWindows)
           })
     
     return results
   ```

2. **Sequential Appearances Detection**:
   ```pseudocode
   function findSequentialAppearances(videoData, sequence, maxWindowSize):
     windows = []
     
     // Get all instances of the first object
     firstObjectInstances = videoData[sequence[0]]
     
     for each firstInstance in firstObjectInstances:
       startTime = firstInstance.start_time
       endTime = firstInstance.end_time
       validSequence = true
       
       // For each subsequent object in the sequence
       for i = 1 to sequence.length - 1:
         currentObject = sequence[i]
         currentInstances = videoData[currentObject]
         
         // Find an instance that starts after the previous object ends
         nextInstance = find instance in currentInstances where instance.start_time >= endTime
         
         if no nextInstance found:
           validSequence = false
           break
         
         // Update the end time
         endTime = nextInstance.end_time
         
         // Check if the window size exceeds the maximum
         if maxWindowSize > 0 && (endTime - startTime) > maxWindowSize:
           validSequence = false
           break
       
       if validSequence:
         windows.push({
           start_time: startTime,
           end_time: endTime
         })
     
     return windows
   ```

3. **Time Complexity**:
   - O(n * m) where n is the number of instances of the first object and m is the length of the sequence
   - With optimizations using temporal indexing: O(n * log m)

## Instance Queries

### Instance Overlap Algorithm

The algorithm for finding overlapping instances (`/query/queryInstanceOverlaps`):

```pseudocode
function queryInstanceOverlaps(object, count):
  results = []
  
  // Query the database for videos containing the object
  videoIds = getVideosContainingObject(object)
  
  for each videoId in videoIds:
    // Get instances of the object in the video
    instances = getObjectInstances(videoId, object)
    
    // Find overlaps using sweep line algorithm
    overlaps = findOverlaps(instances, count)
    
    if overlaps.length > 0:
      results.push({
        video_id: videoId,
        success_intervals: overlaps
      })
  
  return results

function findOverlaps(instances, minCount):
  // Extract start and end events
  events = []
  for each instance in instances:
    events.push({time: instance.start_time, type: "start"})
    events.push({time: instance.end_time, type: "end"})
  
  // Sort events by time
  sort events by time
  
  // Sweep line algorithm
  activeCount = 0
  overlaps = []
  overlapStart = null
  
  for each event in events:
    if event.type == "start":
      activeCount++
      
      // If we just reached the minimum count, mark the start of an overlap
      if activeCount == minCount:
        overlapStart = event.time
    
    else if event.type == "end":
      // If we're dropping below the minimum count, record the overlap
      if activeCount == minCount:
        overlaps.push({
          start: overlapStart,
          end: event.time
        })
        overlapStart = null
      
      activeCount--
  
  return mergeOverlappingIntervals(overlaps)
```

### Instance Overlap in Area Algorithm

The algorithm for finding overlapping instances in a specific area (`/query/queryInstanceOverlapsInArea`):

```pseudocode
function queryInstanceOverlapsInArea(object, count, area):
  results = []
  
  // Parse the area
  parsedArea = interpretArea(area)
  
  // Query the database for videos containing the object
  videoIds = getVideosContainingObject(object)
  
  for each videoId in videoIds:
    // Get instances of the object in the video
    instances = getObjectInstances(videoId, object)
    
    // Filter instances by area
    areaInstances = []
    for each instance in instances:
      if hasFrameInArea(instance, parsedArea):
        areaInstances.push(instance)
    
    // Find overlaps using sweep line algorithm
    overlaps = findOverlaps(areaInstances, count)
    
    if overlaps.length > 0:
      results.push({
        video_id: videoId,
        success_intervals: overlaps
      })
  
  return results

function hasFrameInArea(instance, area):
  for each frame in instance.frames:
    if isInArea(frame.bbox, area):
      return true
  return false
```

## Video Chunk Processing

### Video Chunk Extraction Algorithm

The algorithm for extracting video chunks (`/query/chunks`):

```pseudocode
function getVideoChunks(videos):
  results = []
  
  for each video in videos:
    videoId = video.video_id
    windows = video.windows
    
    // Merge overlapping windows
    mergedWindows = mergeOverlappingWindows(windows)
    
    chunks = []
    for each window in mergedWindows:
      // Extract the video chunk
      chunkId = generateChunkId(videoId, window.start_time, window.end_time)
      extractVideoChunk(videoId, window.start_time, window.end_time, chunkId)
      
      chunks.push({
        chunk_id: chunkId,
        start_time: window.start_time,
        end_time: window.end_time,
        duration: window.end_time - window.start_time
      })
    
    results.push({
      video_id: videoId,
      chunks: chunks
    })
  
  return results

function mergeOverlappingWindows(windows):
  if windows.length == 0:
    return []
  
  // Sort windows by start time
  sort windows by start_time
  
  mergedWindows = [windows[0]]
  
  for i = 1 to windows.length - 1:
    currentWindow = windows[i]
    lastMerged = mergedWindows[mergedWindows.length - 1]
    
    // If current window overlaps with last merged window
    if currentWindow.start_time <= lastMerged.end_time:
      // Extend the last merged window
      lastMerged.end_time = max(lastMerged.end_time, currentWindow.end_time)
    else:
      // Add as a new window
      mergedWindows.push(currentWindow)
  
  return mergedWindows
```

## Optimization Techniques

### 1. Spatial Indexing with QuadTree

The QuadTree data structure is used for efficient spatial queries:

```pseudocode
class QuadTree:
  constructor(x, y, width, height, maxObjects = 10, maxLevels = 4, level = 0):
    this.bounds = {x, y, width, height}
    this.maxObjects = maxObjects
    this.maxLevels = maxLevels
    this.level = level
    this.objects = []
    this.nodes = []
  
  split():
    // Split the node into four quadrants
    nextLevel = this.level + 1
    subWidth = this.bounds.width / 2
    subHeight = this.bounds.height / 2
    x = this.bounds.x
    y = this.bounds.y
    
    // Top right
    this.nodes[0] = new QuadTree(x + subWidth, y, subWidth, subHeight, 
                                this.maxObjects, this.maxLevels, nextLevel)
    // Top left
    this.nodes[1] = new QuadTree(x, y, subWidth, subHeight, 
                                this.maxObjects, this.maxLevels, nextLevel)
    // Bottom left
    this.nodes[2] = new QuadTree(x, y + subHeight, subWidth, subHeight, 
                                this.maxObjects, this.maxLevels, nextLevel)
    // Bottom right
    this.nodes[3] = new QuadTree(x + subWidth, y + subHeight, subWidth, subHeight, 
                                this.maxObjects, this.maxLevels, nextLevel)
  
  getIndex(bbox):
    // Determine which node the object belongs to
    // -1 means object cannot completely fit within a child node and is part of the parent node
    
    let index = -1
    let verticalMidpoint = this.bounds.x + (this.bounds.width / 2)
    let horizontalMidpoint = this.bounds.y + (this.bounds.height / 2)
    
    // Object can completely fit within the top quadrants
    let topQuadrant = (bbox.y < horizontalMidpoint && bbox.y + bbox.height < horizontalMidpoint)
    // Object can completely fit within the bottom quadrants
    let bottomQuadrant = (bbox.y > horizontalMidpoint)
    
    // Object can completely fit within the left quadrants
    if (bbox.x < verticalMidpoint && bbox.x + bbox.width < verticalMidpoint):
      if (topQuadrant):
        index = 1
      else if (bottomQuadrant):
        index = 2
    
    // Object can completely fit within the right quadrants
    else if (bbox.x > verticalMidpoint):
      if (topQuadrant):
        index = 0
      else if (bottomQuadrant):
        index = 3
    
    return index
  
  insert(bbox, object):
    // If we have subnodes, try to insert the object into them
    if this.nodes.length > 0:
      let index = this.getIndex(bbox)
      
      if index != -1:
        this.nodes[index].insert(bbox, object)
        return
    
    // Otherwise, add the object to this node
    this.objects.push({bbox, object})
    
    // Check if we need to split
    if this.objects.length > this.maxObjects && this.level < this.maxLevels:
      if this.nodes.length == 0:
        this.split()
      
      // Redistribute existing objects
      for i = 0 to this.objects.length - 1:
        let index = this.getIndex(this.objects[i].bbox)
        if index != -1:
          this.nodes[index].insert(this.objects[i].bbox, this.objects[i].object)
          this.objects.splice(i, 1)
          i--
  
  query(area, found = []):
    // Check if area intersects with this node
    if !intersects(area, this.bounds):
      return found
    
    // Check objects at this level
    for each obj in this.objects:
      if intersects(area, obj.bbox):
        found.push(obj.object)
    
    // Check child nodes
    for each node in this.nodes:
      node.query(area, found)
    
    return found
```

### 2. Temporal Indexing with Interval Tree

The Interval Tree data structure is used for efficient temporal queries:

```pseudocode
class IntervalTreeNode:
  constructor(start, end, data):
    this.start = start
    this.end = end
    this.data = data
    this.max = end
    this.left = null
    this.right = null

class IntervalTree:
  constructor():
    this.root = null
  
  insert(start, end, data):
    this.root = this._insert(this.root, start, end, data)
  
  _insert(node, start, end, data):
    if node == null:
      return new IntervalTreeNode(start, end, data)
    
    // Update max if needed
    if end > node.max:
      node.max = end
    
    // Insert to left or right subtree
    if start < node.start:
      node.left = this._insert(node.left, start, end, data)
    else:
      node.right = this._insert(node.right, start, end, data)
    
    return node
  
  queryOverlap(start, end, results = []):
    return this._queryOverlap(this.root, start, end, results)
  
  _queryOverlap(node, start, end, results):
    if node == null:
      return results
    
    // Check if current node overlaps with query interval
    if !(end < node.start || start > node.end):
      results.push(node.data)
    
    // If left child's max end time is greater than query start time,
    // there might be overlapping intervals in the left subtree
    if node.left != null && node.left.max >= start:
      this._queryOverlap(node.left, start, end, results)
    
    // Check right subtree
    if node.right != null && node.start <= end:
      this._queryOverlap(node.right, start, end, results)
    
    return results
```

### 3. Sweep Line Algorithm for Overlap Detection

The Sweep Line algorithm is used for efficiently finding overlaps:

```pseudocode
function findOverlaps(intervals, minCount):
  // Extract start and end events
  events = []
  for each interval in intervals:
    events.push({time: interval.start, type: "start", interval: interval})
    events.push({time: interval.end, type: "end", interval: interval})
  
  // Sort events by time
  sort events by time, then by type (end before start)
  
  // Sweep line algorithm
  activeIntervals = []
  overlaps = []
  
  for each event in events:
    if event.type == "start":
      activeIntervals.push(event.interval)
      
      // If we just reached the minimum count, mark the start of an overlap
      if activeIntervals.length == minCount:
        overlaps.push({start: event.time, activeIntervals: [...activeIntervals]})
    
    else if event.type == "end":
      // Remove the interval from active intervals
      remove event.interval from activeIntervals
      
      // If we're dropping below the minimum count, record the overlap end
      if activeIntervals.length == minCount - 1 && overlaps.length > 0 && !overlaps[overlaps.length - 1].end:
        overlaps[overlaps.length - 1].end = event.time
  
  return overlaps
```

### 4. Merging Overlapping Intervals

The algorithm for merging overlapping intervals:

```pseudocode
function mergeOverlappingIntervals(intervals):
  if intervals.length == 0:
    return []
  
  // Sort intervals by start time
  sort intervals by start
  
  mergedIntervals = [intervals[0]]
  
  for i = 1 to intervals.length - 1:
    current = intervals[i]
    last = mergedIntervals[mergedIntervals.length - 1]
    
    // If current interval overlaps with last merged interval
    if current.start <= last.end:
      // Extend the last merged interval
      last.end = max(last.end, current.end)
    else:
      // Add as a new interval
      mergedIntervals.push(current)
  
  return mergedIntervals
```

### 5. Batch Processing

The algorithm for batch processing multiple queries:

```pseudocode
function batchQuery(queries):
  results = []
  
  for each query in queries:
    queryType = query.type
    queryParams = query.params
    
    // Execute the appropriate query based on type
    if queryType == "objects":
      result = queryObjects(queryParams.objects, queryParams.window_size)
    else if queryType == "spatialObjects":
      result = querySpatialObjects(queryParams.objects, queryParams.area)
    else if queryType == "sequence":
      result = querySequence(queryParams.sequence, queryParams.window_size)
    // ... other query types
    
    results.push({
      type: queryType,
      result: result
    })
  
  return results
```

### 6. Pagination

The algorithm for paginated queries:

```pseudocode
function paginatedQuery(queryFunction, params, page, limit):
  // Calculate offset
  offset = (page - 1) * limit
  
  // Execute the query with pagination parameters
  totalResults = queryFunction(params)
  
  // Apply pagination
  paginatedResults = totalResults.slice(offset, offset + limit)
  
  return {
    results: paginatedResults,
    pagination: {
      total: totalResults.length,
      page: page,
      limit: limit,
      pages: Math.ceil(totalResults.length / limit)
    }
  }
``` 