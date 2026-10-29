const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  firebaseUID: {
    type: String,
    required: true,
    index: true
  },
  gridFsFileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true,
    trim: true
  },
  storageFilename: {
    type: String,
    required: true,
    trim: true
  },
  mimeType: {
    type: String,
    required: true,
    enum: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ]
  },
  size: {
    type: Number,
    required: true,
    min: 1
  },
  fileHash: {
    type: String,
    default: null
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  extractionStatus: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'PARSED_EMPTY', 'FAILED'],
    default: 'PENDING',
    index: true
  },
  extractionError: {
    type: String,
    default: null
  },
  extractedData: {
    skills: {
      type: [String],
      default: []
    },
    education: {
      type: [String],
      default: []
    },
    experience: {
      type: [String],
      default: []
    },
    projects: {
      type: [String],
      default: []
    },
    certifications: {
      type: [String],
      default: []
    },
    keywords: {
      type: [String],
      default: []
    },
    rawTextPreview: {
      type: String,
      default: ''
    },
    characterCount: {
      type: Number,
      default: 0
    }
  },
  confirmedSkills: {
    type: [String],
    default: []
  },
  confirmedAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  adminOverride: {
    overridden: {
      type: Boolean,
      default: false
    },
    overriddenBy: {
      type: String,
      default: null
    },
    overriddenAt: {
      type: Date,
      default: null
    },
    reason: {
      type: String,
      default: null
    }
  }
}, {
  timestamps: true
});

resumeSchema.index({ studentId: 1, isActive: 1 });
resumeSchema.index({ firebaseUID: 1, isActive: 1 });
resumeSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('Resume', resumeSchema);
