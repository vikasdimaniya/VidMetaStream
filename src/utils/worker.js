/**
 * Worker thread utility for parallel processing
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const os = require('os');
const logger = require('./logger');

// Number of CPU cores available
const numCPUs = os.cpus().length;

/**
 * Worker pool for managing worker threads
 */
class WorkerPool {
  /**
   * Create a new worker pool
   * @param {number} numWorkers - Number of workers to create (default: number of CPU cores)
   */
  constructor(numWorkers = numCPUs) {
    this.numWorkers = numWorkers;
    this.workers = [];
    this.taskQueue = [];
    this.freeWorkers = [];
    this.initialized = false;
  }

  /**
   * Initialize the worker pool
   */
  initialize() {
    if (this.initialized) return;

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker(__filename);
      
      worker.on('message', (result) => {
        // Get the callback for this worker
        const callback = this.workers[i].callback;
        this.workers[i].callback = null;
        
        // Add worker back to free pool
        this.freeWorkers.push(i);
        
        // Process next task if any
        if (this.taskQueue.length > 0) {
          const task = this.taskQueue.shift();
          this.runTask(task.task, task.data, task.callback);
        }
        
        // Call the callback with the result
        if (callback) {
          callback(null, result);
        }
      });
      
      worker.on('error', (err) => {
        const callback = this.workers[i].callback;
        this.workers[i].callback = null;
        
        // Add worker back to free pool
        this.freeWorkers.push(i);
        
        // Process next task if any
        if (this.taskQueue.length > 0) {
          const task = this.taskQueue.shift();
          this.runTask(task.task, task.data, task.callback);
        }
        
        // Call the callback with the error
        if (callback) {
          callback(err);
        }
      });
      
      this.workers.push({
        worker,
        callback: null
      });
      
      this.freeWorkers.push(i);
    }
    
    this.initialized = true;
    logger.info(`Worker pool initialized with ${this.numWorkers} workers`);
  }

  /**
   * Run a task on a worker thread
   * @param {string} task - Task name
   * @param {Object} data - Task data
   * @param {Function} callback - Callback function
   */
  runTask(task, data, callback) {
    if (!this.initialized) {
      this.initialize();
    }
    
    if (this.freeWorkers.length === 0) {
      // No free workers, queue the task
      this.taskQueue.push({ task, data, callback });
      return;
    }
    
    // Get a free worker
    const workerId = this.freeWorkers.pop();
    const worker = this.workers[workerId].worker;
    
    // Set the callback
    this.workers[workerId].callback = callback;
    
    // Send the task to the worker
    worker.postMessage({ task, data });
  }

  /**
   * Run a task and return a promise
   * @param {string} task - Task name
   * @param {Object} data - Task data
   * @returns {Promise<*>} - Task result
   */
  runTaskAsync(task, data) {
    return new Promise((resolve, reject) => {
      this.runTask(task, data, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Run multiple tasks in parallel
   * @param {string} task - Task name
   * @param {Array} dataItems - Array of task data items
   * @returns {Promise<Array>} - Array of task results
   */
  async runTasksAsync(task, dataItems) {
    return Promise.all(dataItems.map(data => this.runTaskAsync(task, data)));
  }

  /**
   * Terminate all workers
   */
  terminate() {
    if (!this.initialized) return;
    
    for (const { worker } of this.workers) {
      worker.terminate();
    }
    
    this.workers = [];
    this.freeWorkers = [];
    this.taskQueue = [];
    this.initialized = false;
    
    logger.info('Worker pool terminated');
  }
}

// Task handlers for worker threads
const taskHandlers = {
  // Spatial query task
  spatialQuery: (data) => {
    const { objects, area } = data;
    // Implement spatial query logic here
    return { objects, area, result: 'Spatial query result' };
  },
  
  // Temporal query task
  temporalQuery: (data) => {
    const { intervals, queryInterval } = data;
    // Implement temporal query logic here
    return { intervals, queryInterval, result: 'Temporal query result' };
  },
  
  // Instance overlap task
  findInstanceOverlaps: (data) => {
    const { instances, count } = data;
    
    // Sort all start and end points
    const events = [];
    
    instances.forEach(instance => {
      events.push({time: instance.start_time, type: 'start', instance});
      events.push({time: instance.end_time, type: 'end', instance});
    });
    
    // Sort events by time
    events.sort((a, b) => a.time - b.time);
    
    // Sweep through events
    const activeInstances = new Set();
    const overlaps = [];
    
    for (const event of events) {
      if (event.type === 'start') {
        activeInstances.add(event.instance);
        
        // Check if we have enough active instances
        if (activeInstances.size >= count) {
          // Create overlap with current active instances
          overlaps.push({
            start_time: event.time,
            instances: Array.from(activeInstances)
          });
        }
      } else {
        activeInstances.delete(event.instance);
        
        // If we drop below the required count, end the current overlap
        if (activeInstances.size < count && overlaps.length > 0) {
          const lastOverlap = overlaps[overlaps.length - 1];
          if (!lastOverlap.end_time) {
            lastOverlap.end_time = event.time;
          }
        }
      }
    }
    
    return overlaps;
  }
};

// Worker thread code
if (!isMainThread) {
  // Listen for messages from the main thread
  parentPort.on('message', (message) => {
    const { task, data } = message;
    
    // Check if we have a handler for this task
    if (taskHandlers[task]) {
      try {
        // Execute the task
        const result = taskHandlers[task](data);
        
        // Send the result back to the main thread
        parentPort.postMessage(result);
      } catch (err) {
        // Send the error back to the main thread
        parentPort.postMessage({ error: err.message });
      }
    } else {
      // Unknown task
      parentPort.postMessage({ error: `Unknown task: ${task}` });
    }
  });
}

// Create a singleton instance
const workerPool = new WorkerPool();

module.exports = workerPool; 