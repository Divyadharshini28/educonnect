const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    required: true,
    index: true
  },
  opportunityTitle: {
    type: String,
    trim: true
  },
  opportunityType: {
    type: String,
    trim: true
  },
  opportunityOrg: {
    type: String,
    trim: true
  },
  opportunityUrl: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['Submitted', 'Under Review', 'Accepted', 'Rejected'],
    default: 'Submitted'
  },
  submissionDate: {
    type: Date,
    default: Date.now
  },
  responses: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Prevent duplicate active applications from the same student for the same opportunity
applicationSchema.index({ studentId: 1, opportunityId: 1 }, { unique: true });

module.exports = mongoose.model('Application', applicationSchema);
