/**
 * Query Context Model
 * Stores information about natural language queries and their structured interpretations
 */

import mongoose from 'mongoose';

const queryContextSchema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    index: true
  },
  query_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  natural_query: {
    type: String,
    required: true
  },
  structured_query: {
    type: Object,
    required: true
  },
  api_endpoint: {
    type: String,
    required: true
  },
  api_params: {
    type: Object,
    required: true
  },
  parent_query_id: {
    type: String,
    index: true
  },
  result_windows: [{
    video_id: String,
    start_time: Number,
    end_time: Number,
    objects: [{
      object_name: String,
      instances: [String]
    }]
  }],
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Index for faster lookups
queryContextSchema.index({ session_id: 1, created_at: -1 });

export const QueryContext = mongoose.model('QueryContext', queryContextSchema); 