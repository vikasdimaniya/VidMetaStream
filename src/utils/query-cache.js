/**
 * Query cache utility for caching query results
 */

import logger from './logger.js';

/**
 * LRU Cache implementation
 */
class LRUCache {
  /**
   * Create a new LRU Cache
   * @param {number} capacity - Maximum number of items to store
   */
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
    this.keys = [];
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {*} - Cached value or undefined if not found
   */
  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    // Move key to the end (most recently used)
    this._moveToEnd(key);
    
    return this.cache.get(key);
  }

  /**
   * Set a value in the cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    if (this.cache.has(key)) {
      // Update existing entry
      this.cache.set(key, value);
      this._moveToEnd(key);
    } else {
      // Add new entry
      if (this.keys.length >= this.capacity) {
        // Evict least recently used
        const lruKey = this.keys.shift();
        this.cache.delete(lruKey);
      }
      
      this.cache.set(key, value);
      this.keys.push(key);
    }
  }

  /**
   * Check if a key exists in the cache
   * @param {string} key - Cache key
   * @returns {boolean} - True if key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete a key from the cache
   * @param {string} key - Cache key
   */
  delete(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      const index = this.keys.indexOf(key);
      if (index !== -1) {
        this.keys.splice(index, 1);
      }
    }
  }

  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
    this.keys = [];
  }

  /**
   * Get the number of items in the cache
   * @returns {number} - Number of items
   */
  size() {
    return this.cache.size;
  }

  /**
   * Move a key to the end of the keys array (most recently used)
   * @param {string} key - Cache key
   * @private
   */
  _moveToEnd(key) {
    const index = this.keys.indexOf(key);
    if (index !== -1) {
      this.keys.splice(index, 1);
      this.keys.push(key);
    }
  }
}

/**
 * Query Cache for caching query results
 */
class QueryCache {
  /**
   * Create a new query cache
   * @param {Object} options - Cache options
   * @param {number} options.capacity - Maximum number of queries to cache (default: 100)
   * @param {number} options.ttl - Time to live in milliseconds (default: 1 hour)
   */
  constructor(options = {}) {
    this.capacity = options.capacity || 100;
    this.ttl = options.ttl || 3600000; // 1 hour in milliseconds
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100 MB default
    this.currentSize = 0;
    this.cache = new LRUCache(this.capacity);
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }

  /**
   * Normalize parameters for consistent cache key generation
   * Handles MongoDB ObjectIds, Decimal128, and other special types
   * @param {*} params - Parameters to normalize
   * @returns {*} - Normalized parameters
   * @private
   */
  _normalizeParams(params) {
    if (params === null || params === undefined) {
      return params;
    }
    
    // Handle MongoDB ObjectId
    if (params._bsontype === 'ObjectID' || params.constructor?.name === 'ObjectId') {
      return params.toString();
    }
    
    // Handle Mongoose ObjectId
    if (params.constructor?.name === 'ObjectID') {
      return params.toString();
    }
    
    // Handle Decimal128
    if (params._bsontype === 'Decimal128' || params.$numberDecimal) {
      return parseFloat(params.$numberDecimal || params.toString());
    }
    
    // Handle Arrays
    if (Array.isArray(params)) {
      return params.map(p => this._normalizeParams(p));
    }
    
    // Handle Objects
    if (typeof params === 'object') {
      const normalized = {};
      for (const [key, value] of Object.entries(params)) {
        normalized[key] = this._normalizeParams(value);
      }
      return normalized;
    }
    
    // Primitive types (string, number, boolean)
    return params;
  }

  /**
   * Generate a cache key from query type and parameters
   * @param {string} queryType - Type of query
   * @param {Object} params - Query parameters
   * @returns {string} - Cache key
   */
  getCacheKey(queryType, params) {
    const normalized = this._normalizeParams(params);
    return `${queryType}:${JSON.stringify(normalized)}`;
  }

  /**
   * Get a cached query result
   * @param {string} queryType - Type of query
   * @param {Object} params - Query parameters
   * @returns {Object|undefined} - Cached result or undefined if not found or expired
   */
  get(queryType, params) {
    const key = this.getCacheKey(queryType, params);
    const cached = this.cache.get(key);
    
    if (cached) {
      // Check if expired
      if (Date.now() - cached.timestamp > this.ttl) {
        this.cache.delete(key);
        this.stats.misses++;
        return undefined;
      }
      
      this.stats.hits++;
      logger.debug(`Cache hit for ${queryType}`, { params });
      return cached.result;
    }
    
    this.stats.misses++;
    return undefined;
  }

  /**
   * Estimate the size of an object in bytes (rough approximation)
   * @param {*} obj - Object to estimate
   * @returns {number} - Estimated size in bytes
   * @private
   */
  _estimateSize(obj) {
    try {
      const str = JSON.stringify(obj);
      // UTF-16 encoding: 2 bytes per character
      return str.length * 2;
    } catch (error) {
      // If JSON.stringify fails (circular reference, etc), estimate conservatively
      logger.warn('Failed to estimate cache entry size', { error: error.message });
      return 10 * 1024; // 10 KB default
    }
  }

  /**
   * Evict least recently used entries until size is under limit
   * @private
   */
  _evictToFitSize(newEntrySize) {
    // Evict LRU entries until we have space
    while (this.currentSize + newEntrySize > this.maxSize && this.cache.size() > 0) {
      // Get least recently used key (first in array)
      const lruKey = this.cache.keys[0];
      const lruEntry = this.cache.get(lruKey);
      
      if (lruEntry && lruEntry.size) {
        this.currentSize -= lruEntry.size;
      }
      
      this.cache.delete(lruKey);
      this.stats.evictions++;
      
      logger.debug('Evicted cache entry due to size limit', { 
        key: lruKey, 
        currentSize: this.currentSize,
        maxSize: this.maxSize 
      });
    }
  }

  /**
   * Set a query result in the cache
   * @param {string} queryType - Type of query
   * @param {Object} params - Query parameters
   * @param {*} result - Query result
   */
  set(queryType, params, result) {
    const key = this.getCacheKey(queryType, params);
    const size = this._estimateSize(result);
    
    // Don't cache if entry is larger than max size
    if (size > this.maxSize) {
      logger.warn('Cache entry too large, skipping', { 
        queryType, 
        size: (size / 1024 / 1024).toFixed(2) + ' MB',
        maxSize: (this.maxSize / 1024 / 1024).toFixed(2) + ' MB'
      });
      return;
    }
    
    // Evict entries if needed to make space
    this._evictToFitSize(size);
    
    // Check if key already exists and update size tracking
    const existing = this.cache.get(key);
    if (existing && existing.size) {
      this.currentSize -= existing.size;
    }
    
    // Add new entry
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      size
    });
    
    this.currentSize += size;
    this.stats.sets++;
    
    logger.debug(`Cached result for ${queryType}`, { 
      params, 
      size: (size / 1024).toFixed(2) + ' KB',
      totalSize: (this.currentSize / 1024 / 1024).toFixed(2) + ' MB'
    });
  }

  /**
   * Execute a query with caching
   * @param {string} queryType - Type of query
   * @param {Object} params - Query parameters
   * @param {Function} queryFn - Function to execute if cache miss
   * @returns {Promise<*>} - Query result
   */
  async query(queryType, params, queryFn) {
    // Check cache first
    const cachedResult = this.get(queryType, params);
    if (cachedResult !== undefined) {
      return cachedResult;
    }
    
    // Cache miss, execute query
    const result = await queryFn();
    
    // Cache the result
    this.set(queryType, params, result);
    
    return result;
  }

  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
    this.currentSize = 0;
    logger.info('Query cache cleared');
  }

  /**
   * Invalidate cache entries for a specific video
   * @param {string|ObjectId} video_id - Video ID to invalidate
   */
  invalidateVideo(video_id) {
    const video_id_str = video_id.toString();
    let invalidatedCount = 0;
    let freedSize = 0;
    
    // Iterate through all cache entries
    const keysToDelete = [];
    for (const key of this.cache.keys) {
      if (key.includes(video_id_str)) {
        keysToDelete.push(key);
      }
    }
    
    // Delete matching entries
    for (const key of keysToDelete) {
      const entry = this.cache.get(key);
      if (entry && entry.size) {
        freedSize += entry.size;
        this.currentSize -= entry.size;
      }
      this.cache.delete(key);
      invalidatedCount++;
    }
    
    logger.info('Cache invalidated for video', { 
      video_id: video_id_str, 
      entriesInvalidated: invalidatedCount,
      freedSize: (freedSize / 1024 / 1024).toFixed(2) + ' MB'
    });
  }

  /**
   * Invalidate cache entries for a specific object
   * @param {string} object_name - Object name to invalidate
   */
  invalidateObject(object_name) {
    let invalidatedCount = 0;
    let freedSize = 0;
    
    // Create a regex pattern to match object_name in cache keys
    const pattern = `"object_name":"${object_name}"`;
    
    // Iterate through all cache entries
    const keysToDelete = [];
    for (const key of this.cache.keys) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    
    // Delete matching entries
    for (const key of keysToDelete) {
      const entry = this.cache.get(key);
      if (entry && entry.size) {
        freedSize += entry.size;
        this.currentSize -= entry.size;
      }
      this.cache.delete(key);
      invalidatedCount++;
    }
    
    logger.info('Cache invalidated for object', { 
      object_name, 
      entriesInvalidated: invalidatedCount,
      freedSize: (freedSize / 1024 / 1024).toFixed(2) + ' MB'
    });
  }

  /**
   * Invalidate cache entries matching a pattern
   * @param {RegExp|string} pattern - Pattern to match cache keys
   */
  invalidatePattern(pattern) {
    let invalidatedCount = 0;
    let freedSize = 0;
    
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    // Iterate through all cache entries
    const keysToDelete = [];
    for (const key of this.cache.keys) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    // Delete matching entries
    for (const key of keysToDelete) {
      const entry = this.cache.get(key);
      if (entry && entry.size) {
        freedSize += entry.size;
        this.currentSize -= entry.size;
      }
      this.cache.delete(key);
      invalidatedCount++;
    }
    
    logger.info('Cache invalidated by pattern', { 
      pattern: pattern.toString(), 
      entriesInvalidated: invalidatedCount,
      freedSize: (freedSize / 1024 / 1024).toFixed(2) + ' MB'
    });
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      entries: this.cache.size(),
      currentSize: this.currentSize,
      currentSizeMB: (this.currentSize / 1024 / 1024).toFixed(2),
      maxSizeMB: (this.maxSize / 1024 / 1024).toFixed(2),
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      utilizationPercent: ((this.currentSize / this.maxSize) * 100).toFixed(2)
    };
  }
}

// Create a singleton instance
const queryCache = new QueryCache();

// Named exports
export { LRUCache, QueryCache };

// Default export (singleton instance)
export default queryCache; 