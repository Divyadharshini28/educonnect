const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['DEADLINE_APPROACHING', 'DEADLINE_TODAY', 'APPLICATION_UPDATE', 'RECOMMENDATION', 'SYSTEM'],
    default: 'DEADLINE_APPROACHING'
  },
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    default: null
  },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    default: null
  },
  link: {
    type: String,
    default: ''
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  dedupKey: {
    type: String,
    default: null,
    index: true
  }
});

// Ensure dedupKey is unique per student when present to prevent duplicate notifications
notificationSchema.index({ studentId: 1, dedupKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
