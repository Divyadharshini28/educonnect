const mongoose = require('mongoose');

const ALLOWED_INTERACTION_TYPES = [
  'VIEW',
  'CLICK',
  'BOOKMARK',
  'UNBOOKMARK',
  'APPLY',
  'DISMISS'
];

const interactionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'studentId is required for interaction tracking'],
    index: true
  },
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    required: [true, 'opportunityId is required for interaction tracking'],
    index: true
  },
  interactionType: {
    type: String,
    required: [true, 'interactionType is required'],
    enum: {
      values: ALLOWED_INTERACTION_TYPES,
      message: 'Invalid interactionType: `{VALUE}`. Must be one of: ' + ALLOWED_INTERACTION_TYPES.join(', ')
    },
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Indexing for ML aggregation and student query patterns
// 1. Student + Opportunity history (ordered by recency)
interactionSchema.index({ studentId: 1, opportunityId: 1, timestamp: -1 });

// 2. Student + Interaction Type history (ordered by recency)
interactionSchema.index({ studentId: 1, interactionType: 1, timestamp: -1 });

// 3. Student general interaction timeline (for pagination)
interactionSchema.index({ studentId: 1, timestamp: -1 });

// 4. Global timeline for ML batch extracts
interactionSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Interaction', interactionSchema);
module.exports.ALLOWED_INTERACTION_TYPES = ALLOWED_INTERACTION_TYPES;
