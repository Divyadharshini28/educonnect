const mongoose = require('mongoose');

const statusHistoryEntrySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  // Source of the status change
  source: {
    type: String,
    enum: ['student-reported', 'admin-recorded', 'provider-confirmed', 'system'],
    default: 'system'
  },
  // Optional note or reason for the status change
  note: {
    type: String,
    default: null,
    trim: true
  },
  // Who made the change (admin email or 'student' or 'system')
  changedBy: {
    type: String,
    default: null,
    trim: true
  }
}, { _id: false });

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
    enum: ['Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Offered', 'Accepted', 'Rejected', 'Withdrawn'],
    default: 'Submitted'
  },
  // Timestamped history of all status transitions
  statusHistory: {
    type: [statusHistoryEntrySchema],
    default: []
  },
  submissionDate: {
    type: Date,
    default: Date.now
  },
  // How this application was submitted
  applicationMethod: {
    type: String,
    enum: ['internal', 'external-link', 'direct-api'],
    default: 'internal'
  },
  // Whether the current status was self-reported by the student (for external applications)
  isStudentReported: {
    type: Boolean,
    default: false
  },
  // External submission reference/confirmation code if provided by the provider
  externalReference: {
    type: String,
    default: null,
    trim: true
  },
  responses: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Prevent duplicate active applications from the same student for the same opportunity
applicationSchema.index({ studentId: 1, opportunityId: 1 }, { unique: true });

module.exports = mongoose.model('Application', applicationSchema);
