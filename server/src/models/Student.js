const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  firebaseUID: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  department: {
    type: String,
    default: '',
    trim: true
  },
  year: {
    type: Number,
    min: 1,
    max: 5,
    default: 1
  },
  cgpa: {
    type: Number,
    min: 0,
    max: 10,
    default: 0
  },
  skills: {
    type: [String],
    default: []
  },
  interests: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Student', studentSchema);
