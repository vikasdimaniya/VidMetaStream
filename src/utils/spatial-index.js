/**
 * Spatial indexing utilities for efficient spatial queries
 */

/**
 * Simple QuadTree implementation for spatial indexing
 */
class QuadTree {
  /**
   * Create a new QuadTree node
   * @param {number} x - X coordinate of top-left corner
   * @param {number} y - Y coordinate of top-left corner
   * @param {number} width - Width of the quadrant
   * @param {number} height - Height of the quadrant
   * @param {number} maxObjects - Maximum objects before splitting
   * @param {number} maxLevels - Maximum levels of subdivision
   * @param {number} level - Current level (used internally)
   */
  constructor(x, y, width, height, maxObjects = 10, maxLevels = 4, level = 0) {
    this.bounds = { x, y, width, height };
    this.maxObjects = maxObjects;
    this.maxLevels = maxLevels;
    this.level = level;
    this.objects = [];
    this.nodes = []; // Subdivisions: top-right, top-left, bottom-left, bottom-right
  }

  /**
   * Split the node into 4 quadrants
   */
  split() {
    const nextLevel = this.level + 1;
    const subWidth = this.bounds.width / 2;
    const subHeight = this.bounds.height / 2;
    const x = this.bounds.x;
    const y = this.bounds.y;

    // Top right
    this.nodes[0] = new QuadTree(
      x + subWidth, 
      y, 
      subWidth, 
      subHeight, 
      this.maxObjects, 
      this.maxLevels, 
      nextLevel
    );

    // Top left
    this.nodes[1] = new QuadTree(
      x, 
      y, 
      subWidth, 
      subHeight, 
      this.maxObjects, 
      this.maxLevels, 
      nextLevel
    );

    // Bottom left
    this.nodes[2] = new QuadTree(
      x, 
      y + subHeight, 
      subWidth, 
      subHeight, 
      this.maxObjects, 
      this.maxLevels, 
      nextLevel
    );

    // Bottom right
    this.nodes[3] = new QuadTree(
      x + subWidth, 
      y + subHeight, 
      subWidth, 
      subHeight, 
      this.maxObjects, 
      this.maxLevels, 
      nextLevel
    );
  }

  /**
   * Determine which quadrant an object belongs to
   * @param {Object} rect - Object with x, y, width, height properties
   * @returns {number} - Index of the quadrant (0-3) or -1 if it spans multiple quadrants
   */
  getIndex(rect) {
    const midX = this.bounds.x + (this.bounds.width / 2);
    const midY = this.bounds.y + (this.bounds.height / 2);
    
    // Object can completely fit within the top quadrants
    const topQuadrant = (rect.y < midY && rect.y + rect.height < midY);
    // Object can completely fit within the bottom quadrants
    const bottomQuadrant = (rect.y > midY);

    // Object can completely fit within the left quadrants
    if (rect.x < midX && rect.x + rect.width < midX) {
      if (topQuadrant) {
        return 1; // Top left
      } else if (bottomQuadrant) {
        return 2; // Bottom left
      }
    } 
    // Object can completely fit within the right quadrants
    else if (rect.x > midX) {
      if (topQuadrant) {
        return 0; // Top right
      } else if (bottomQuadrant) {
        return 3; // Bottom right
      }
    }

    // Object spans multiple quadrants
    return -1;
  }

  /**
   * Insert an object into the quadtree
   * @param {Object} obj - Object with id and bbox properties
   */
  insert(obj) {
    // If we have subnodes, try to insert into them
    if (this.nodes.length) {
      const index = this.getIndex(obj.bbox);
      
      if (index !== -1) {
        this.nodes[index].insert(obj);
        return;
      }
    }

    // Add the object to this node
    this.objects.push(obj);

    // Check if we need to split
    if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
      // Split if we don't have subnodes yet
      if (!this.nodes.length) {
        this.split();
      }

      // Redistribute existing objects
      let i = 0;
      while (i < this.objects.length) {
        const index = this.getIndex(this.objects[i].bbox);
        
        if (index !== -1) {
          this.nodes[index].insert(this.objects.splice(i, 1)[0]);
        } else {
          i++;
        }
      }
    }
  }

  /**
   * Find all objects that could collide with the given object
   * @param {Object} rect - Object with x, y, width, height properties
   * @returns {Array} - Array of potential colliding objects
   */
  retrieve(rect) {
    let returnObjects = [];
    const index = this.getIndex(rect);

    // If we have subnodes and the object fits in a quadrant, check that quadrant
    if (this.nodes.length) {
      if (index !== -1) {
        returnObjects = returnObjects.concat(this.nodes[index].retrieve(rect));
      } else {
        // If it spans multiple quadrants, check all quadrants
        for (let i = 0; i < this.nodes.length; i++) {
          returnObjects = returnObjects.concat(this.nodes[i].retrieve(rect));
        }
      }
    }

    // Add all objects in this node
    returnObjects = returnObjects.concat(this.objects);

    return returnObjects;
  }

  /**
   * Query for objects that intersect with the given area
   * @param {Array} area - Area as [x1, y1, x2, y2]
   * @returns {Array} - Array of objects that intersect with the area
   */
  query(area) {
    const rect = {
      x: area[0],
      y: area[1],
      width: area[2] - area[0],
      height: area[3] - area[1]
    };

    return this.retrieve(rect).filter(obj => {
      // Check if the object's bounding box intersects with the query area
      return !(
        obj.bbox.x > area[2] ||
        obj.bbox.x + obj.bbox.width < area[0] ||
        obj.bbox.y > area[3] ||
        obj.bbox.y + obj.bbox.height < area[1]
      );
    });
  }

  /**
   * Clear the quadtree
   */
  clear() {
    this.objects = [];
    
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i]) {
        this.nodes[i].clear();
      }
    }
    
    this.nodes = [];
  }
}

/**
 * Spatial index for efficient spatial queries across videos
 */
class SpatialIndex {
  constructor() {
    this.index = {}; // Map video_id -> quadtree
  }
  
  /**
   * Insert an object into the spatial index
   * @param {string} videoId - Video ID
   * @param {string} objectId - Object ID
   * @param {Object} bbox - Bounding box as {x, y, width, height}
   */
  insert(videoId, objectId, bbox) {
    if (!this.index[videoId]) {
      this.index[videoId] = new QuadTree(0, 0, 1, 1);
    }
    this.index[videoId].insert({id: objectId, bbox});
  }
  
  /**
   * Query for objects in a specific area
   * @param {string} videoId - Video ID
   * @param {Array} area - Area as [x1, y1, x2, y2]
   * @returns {Array} - Array of object IDs that intersect with the area
   */
  query(videoId, area) {
    if (!this.index[videoId]) return [];
    return this.index[videoId].query(area).map(obj => obj.id);
  }

  /**
   * Build index from object data
   * @param {Array} objects - Array of objects with video_id, _id, and frames properties
   */
  buildFromObjects(objects) {
    for (const obj of objects) {
      const videoId = obj.video_id;
      const objectId = obj._id;
      
      // Process each frame
      for (const frame of obj.frames) {
        if (frame.relative_position && frame.relative_position.length === 2) {
          const [x, y] = frame.relative_position;
          // Create a small bounding box around the point
          const bbox = {
            x: x - 0.01,
            y: y - 0.01,
            width: 0.02,
            height: 0.02
          };
          this.insert(videoId, objectId, bbox);
        }
      }
    }
  }

  /**
   * Clear the index for a specific video or all videos
   * @param {string} videoId - Video ID (optional, clears all if not provided)
   */
  clear(videoId) {
    if (videoId) {
      if (this.index[videoId]) {
        this.index[videoId].clear();
        delete this.index[videoId];
      }
    } else {
      this.index = {};
    }
  }
}

export { QuadTree, SpatialIndex };

export default {
  QuadTree,
  SpatialIndex
}; 