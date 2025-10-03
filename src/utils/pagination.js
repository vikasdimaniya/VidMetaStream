/**
 * Pagination utility for handling large result sets
 */

/**
 * Create a paginated response
 * @param {Array} results - The full result set
 * @param {Object} options - Pagination options
 * @param {number} options.page - Current page (1-based)
 * @param {number} options.limit - Number of items per page
 * @returns {Object} - Paginated response
 */
function paginateResults(results, options = {}) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  const paginatedResults = results.slice(startIndex, endIndex);
  
  return {
    results: paginatedResults,
    pagination: {
      total: results.length,
      page,
      limit,
      pages: Math.ceil(results.length / limit)
    }
  };
}

/**
 * Create a paginated MongoDB query
 * @param {Object} query - MongoDB query object
 * @param {Object} options - Pagination options
 * @param {number} options.page - Current page (1-based)
 * @param {number} options.limit - Number of items per page
 * @param {Object} options.sort - Sort options
 * @returns {Object} - MongoDB query with pagination
 */
function createPaginatedQuery(query, options = {}) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const sort = options.sort || { _id: 1 };
  
  const skip = (page - 1) * limit;
  
  return {
    ...query,
    skip,
    limit,
    sort
  };
}

/**
 * Create a paginated response from a MongoDB cursor
 * @param {Object} cursor - MongoDB cursor
 * @param {Object} options - Pagination options
 * @param {number} options.page - Current page (1-based)
 * @param {number} options.limit - Number of items per page
 * @returns {Promise<Object>} - Paginated response
 */
async function paginateCursor(cursor, options = {}) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  
  // Get total count - using countDocuments() instead of count()
  // Clone the cursor to avoid modifying the original
  const countCursor = cursor.clone();
  const total = await countCursor.countDocuments();
  
  // Apply pagination
  const skip = (page - 1) * limit;
  cursor.skip(skip).limit(limit);
  
  // Get results
  const results = await cursor.toArray();
  
  return {
    results,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Create a paginated response with links
 * @param {Array} results - The paginated results
 * @param {Object} pagination - Pagination information
 * @param {string} baseUrl - Base URL for links
 * @returns {Object} - Paginated response with links
 */
function addPaginationLinks(results, pagination, baseUrl) {
  const { total, page, limit, pages } = pagination;
  
  // Create links
  const links = {};
  
  // First page
  links.first = `${baseUrl}?page=1&limit=${limit}`;
  
  // Last page
  links.last = `${baseUrl}?page=${pages}&limit=${limit}`;
  
  // Previous page
  if (page > 1) {
    links.prev = `${baseUrl}?page=${page - 1}&limit=${limit}`;
  }
  
  // Next page
  if (page < pages) {
    links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
  }
  
  return {
    results,
    pagination: {
      total,
      page,
      limit,
      pages
    },
    links
  };
}

/**
 * Create a cursor-based pagination token
 * @param {Object} lastItem - The last item in the current page
 * @param {string} idField - The field to use as cursor (default: '_id')
 * @returns {string} - Pagination token
 */
function createPaginationToken(lastItem, idField = '_id') {
  if (!lastItem) return null;
  
  const token = {
    id: lastItem[idField].toString(),
    timestamp: Date.now()
  };
  
  return Buffer.from(JSON.stringify(token)).toString('base64');
}

/**
 * Parse a cursor-based pagination token
 * @param {string} token - Pagination token
 * @returns {Object|null} - Parsed token or null if invalid
 */
function parsePaginationToken(token) {
  if (!token) return null;
  
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const parsed = JSON.parse(decoded);
    
    // Validate token
    if (!parsed.id || !parsed.timestamp) {
      return null;
    }
    
    return parsed;
  } catch (err) {
    return null;
  }
}

/**
 * Create a cursor-based paginated query
 * @param {Object} query - MongoDB query object
 * @param {Object} options - Pagination options
 * @param {string} options.token - Pagination token
 * @param {number} options.limit - Number of items per page
 * @param {string} options.idField - The field to use as cursor (default: '_id')
 * @param {Object} options.sort - Sort options
 * @returns {Object} - MongoDB query with cursor-based pagination
 */
function createCursorPaginatedQuery(query, options = {}) {
  const limit = options.limit || 20;
  const idField = options.idField || '_id';
  const sort = options.sort || { [idField]: 1 };
  
  // Parse token if provided
  const token = parsePaginationToken(options.token);
  
  // Add cursor condition if token is valid
  if (token) {
    const cursorCondition = { [idField]: { $gt: token.id } };
    
    // Combine with existing query
    if (query.$and) {
      query.$and.push(cursorCondition);
    } else {
      query = {
        $and: [query, cursorCondition]
      };
    }
  }
  
  return {
    ...query,
    limit,
    sort
  };
}

export {
  paginateResults,
  createPaginatedQuery,
  paginateCursor,
  addPaginationLinks,
  createPaginationToken,
  parsePaginationToken,
  createCursorPaginatedQuery
};

export default {
  paginateResults,
  createPaginatedQuery,
  paginateCursor,
  addPaginationLinks,
  createPaginationToken,
  parsePaginationToken,
  createCursorPaginatedQuery
}; 