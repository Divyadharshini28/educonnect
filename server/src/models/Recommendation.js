const mongoose = require('mongoose');

const recommendationItemSchema = new mongoose.Schema({
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    required: true
  },
  score: {
    type: Number,
    required: true
  },
  matchReasons: {
    type: [String],
    default: []
  },
  eligibilityStatus: {
    type: String,
    enum: ['Eligible', 'Partially Eligible', 'Ineligible'],
    default: 'Eligible'
  }
}, { _id: false });

const recommendationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  opportunities: [recommendationItemSchema],
  generatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Recommendation', recommendationSchema);
