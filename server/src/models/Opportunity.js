const mongoose = require('mongoose');

const opportunitySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['scholarship', 'internship', 'hackathon', 'certification'],
    lowercase: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  eligibility: {
    department: {
      type: [String],
      default: ['All']
    },
    minYear: {
      type: Number,
      default: 1
    },
    minCGPA: {
      type: Number,
      default: 0
    },
    skills: {
      type: [String],
      default: []
    }
  },
  deadline: {
    type: Date,
    required: true
  },
  postedDate: {
    type: Date,
    default: Date.now
  },
  organization: {
    type: String,
    default: 'Institution Partner'
  },
  location: {
    type: String,
    default: 'Remote'
  },
  stipendOrReward: {
    type: String,
    default: 'Certificate and Academic Recognition'
  },
  officialUrl: {
    type: String,
    default: 'https://educonnect.ac.in'
  },
  tags: {
    type: [String],
    default: []
  }
});

module.exports = mongoose.model('Opportunity', opportunitySchema);
