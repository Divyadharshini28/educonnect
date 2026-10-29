const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
    trim: true,
    enum: ['hopin', 'brabble', 'bodhdisha', 'devpost', 'remotive', 'arbeitnow', 'all', 'manual', 'internal'],
    lowercase: true,
    index: true
  },
  category: {
    type: String,
    trim: true,
    default: null,
    index: true
  },
  startedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  completedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['IN_PROGRESS', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'CONFIG_REQUIRED'],
    default: 'IN_PROGRESS',
    index: true
  },
  recordsFetched: {
    type: Number,
    default: 0,
    min: 0
  },
  recordsInserted: {
    type: Number,
    default: 0,
    min: 0
  },
  recordsUpdated: {
    type: Number,
    default: 0,
    min: 0
  },
  recordsSkipped: {
    type: Number,
    default: 0,
    min: 0
  },
  errors: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  errorMessage: {
    type: String,
    default: null
  }
}, {
  suppressReservedKeysWarning: true
});

syncLogSchema.index({ startedAt: -1 });

module.exports = mongoose.model('SyncLog', syncLogSchema);
