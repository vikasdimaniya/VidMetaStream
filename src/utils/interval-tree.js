/**
 * Interval Tree implementation for efficient temporal queries
 */

/**
 * Node in the interval tree
 */
class IntervalTreeNode {
  /**
   * Create a new interval tree node
   * @param {number} center - Center point of this node
   */
  constructor(center) {
    this.center = center;
    this.intervals = {
      left: [],   // Intervals completely to the left of center
      right: [],  // Intervals completely to the right of center
      overlap: [] // Intervals that overlap with center
    };
    this.left = null;  // Left subtree
    this.right = null; // Right subtree
  }
}

/**
 * Interval Tree for efficient interval queries
 */
class IntervalTree {
  /**
   * Create a new interval tree
   */
  constructor() {
    this.root = null;
    this.size = 0;
  }

  /**
   * Build the tree from a list of intervals
   * @param {Array} intervals - Array of intervals, each with start and end properties
   */
  build(intervals) {
    if (!intervals || intervals.length === 0) {
      this.root = null;
      this.size = 0;
      return;
    }

    this.size = intervals.length;
    this.root = this._buildRecursive(intervals);
  }

  /**
   * Recursively build the tree
   * @param {Array} intervals - Array of intervals to build the tree from
   * @returns {IntervalTreeNode} - Root node of the subtree
   * @private
   */
  _buildRecursive(intervals) {
    if (intervals.length === 0) return null;

    // Find the median endpoint
    const allPoints = [];
    for (const interval of intervals) {
      allPoints.push(interval.start);
      allPoints.push(interval.end);
    }
    allPoints.sort((a, b) => a - b);
    
    const center = allPoints[Math.floor(allPoints.length / 2)];
    const node = new IntervalTreeNode(center);

    // Partition intervals
    const leftIntervals = [];
    const rightIntervals = [];

    for (const interval of intervals) {
      if (interval.end < center) {
        leftIntervals.push(interval);
        node.intervals.left.push(interval);
      } else if (interval.start > center) {
        rightIntervals.push(interval);
        node.intervals.right.push(interval);
      } else {
        node.intervals.overlap.push(interval);
      }
    }

    // Sort overlapping intervals by start and end for efficient queries
    node.intervals.overlap.sort((a, b) => a.start - b.start);

    // Recursively build subtrees
    node.left = this._buildRecursive(leftIntervals);
    node.right = this._buildRecursive(rightIntervals);

    return node;
  }

  /**
   * Find all intervals that overlap with the given point
   * @param {number} point - The point to query
   * @returns {Array} - Array of intervals that overlap with the point
   */
  queryPoint(point) {
    if (!this.root) return [];
    return this._queryPointRecursive(this.root, point);
  }

  /**
   * Recursively query for intervals that overlap with a point
   * @param {IntervalTreeNode} node - Current node
   * @param {number} point - The point to query
   * @returns {Array} - Array of intervals that overlap with the point
   * @private
   */
  _queryPointRecursive(node, point) {
    if (!node) return [];

    const result = [];

    // Check if point is in any of the overlapping intervals
    for (const interval of node.intervals.overlap) {
      if (interval.start <= point && point <= interval.end) {
        result.push(interval);
      } else if (interval.start > point) {
        // Since overlap intervals are sorted by start time, we can break early
        break;
      }
    }

    // Recursively search in the appropriate subtree
    if (point < node.center) {
      return result.concat(this._queryPointRecursive(node.left, point));
    } else if (point > node.center) {
      return result.concat(this._queryPointRecursive(node.right, point));
    }

    return result;
  }

  /**
   * Find all intervals that overlap with the given interval
   * @param {Object} interval - The interval to query, with start and end properties
   * @returns {Array} - Array of intervals that overlap with the query interval
   */
  queryInterval(interval) {
    if (!this.root) return [];
    return this._queryIntervalRecursive(this.root, interval);
  }

  /**
   * Recursively query for intervals that overlap with an interval
   * @param {IntervalTreeNode} node - Current node
   * @param {Object} interval - The interval to query
   * @returns {Array} - Array of intervals that overlap with the query interval
   * @private
   */
  _queryIntervalRecursive(node, interval) {
    if (!node) return [];

    const result = [];

    // Check overlapping intervals
    for (const nodeInterval of node.intervals.overlap) {
      if (this._intervalsOverlap(interval, nodeInterval)) {
        result.push(nodeInterval);
      }
    }

    // Check left subtree if needed
    if (interval.start < node.center && node.left) {
      result.push(...this._queryIntervalRecursive(node.left, interval));
    }

    // Check right subtree if needed
    if (interval.end > node.center && node.right) {
      result.push(...this._queryIntervalRecursive(node.right, interval));
    }

    return result;
  }

  /**
   * Check if two intervals overlap
   * @param {Object} a - First interval with start and end properties
   * @param {Object} b - Second interval with start and end properties
   * @returns {boolean} - True if intervals overlap
   * @private
   */
  _intervalsOverlap(a, b) {
    return a.start <= b.end && b.start <= a.end;
  }

  /**
   * Insert a new interval into the tree
   * @param {Object} interval - Interval to insert, with start and end properties
   */
  insert(interval) {
    if (!this.root) {
      // If tree is empty, create a new root
      this.root = new IntervalTreeNode((interval.start + interval.end) / 2);
      this.root.intervals.overlap.push(interval);
      this.size = 1;
      return;
    }

    this._insertRecursive(this.root, interval);
    this.size++;
  }

  /**
   * Recursively insert an interval into the tree
   * @param {IntervalTreeNode} node - Current node
   * @param {Object} interval - Interval to insert
   * @private
   */
  _insertRecursive(node, interval) {
    if (interval.end < node.center) {
      // Interval is completely to the left
      node.intervals.left.push(interval);
      if (node.left) {
        this._insertRecursive(node.left, interval);
      } else {
        node.left = new IntervalTreeNode((interval.start + interval.end) / 2);
        node.left.intervals.overlap.push(interval);
      }
    } else if (interval.start > node.center) {
      // Interval is completely to the right
      node.intervals.right.push(interval);
      if (node.right) {
        this._insertRecursive(node.right, interval);
      } else {
        node.right = new IntervalTreeNode((interval.start + interval.end) / 2);
        node.right.intervals.overlap.push(interval);
      }
    } else {
      // Interval overlaps with center
      node.intervals.overlap.push(interval);
      // Keep the overlap list sorted by start time
      node.intervals.overlap.sort((a, b) => a.start - b.start);
    }
  }

  /**
   * Get the size of the tree (number of intervals)
   * @returns {number} - Number of intervals in the tree
   */
  getSize() {
    return this.size;
  }

  /**
   * Clear the tree
   */
  clear() {
    this.root = null;
    this.size = 0;
  }
}

module.exports = IntervalTree; 