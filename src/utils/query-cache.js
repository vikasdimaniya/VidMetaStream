/**
 * Query cache utility for caching query results
 */

const logger = require('./logger');

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
    this.cache = new LRUCache(this.capacity);
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  /**
   * Generate a cache key from query type and parameters
   * @param {string} queryType - Type of query
   * @param {Object} params - Query parameters
   * @returns {string} - Cache key
   */
  getCacheKey(queryType, params) {
    return `${queryType}:${JSON.stringify(params)}`;
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
   * Set a query result in the cache
   * @param {string} queryType - Type of query
   * @param {Object} params - Query parameters
   * @param {*} result - Query result
   */
  set(queryType, params, result) {
    const key = this.getCacheKey(queryType, params);
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
    this.stats.sets++;
    logger.debug(`Cached result for ${queryType}`, { params });
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
    logger.info('Query cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size(),
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
    };
  }
}

// Create a singleton instance
const queryCache = new QueryCache();

module.exports = queryCache; 