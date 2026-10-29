const mongoose = require('mongoose');

const ALLOWED_TYPES = [
  'INTERNSHIP',
  'PLACEMENT',
  'HACKATHON',
  'COMPETITION',
  'SCHOLARSHIP',
  'COURSE',
  'WORKSHOP',
  'CERTIFICATION',
  'internship',
  'placement',
  'hackathon',
  'competition',
  'scholarship',
  'course',
  'workshop',
  'certification'
];

const opportunitySchema = new mongoose.Schema({
  // External Synchronization & Source Fields
  externalId: {
    type: String,
    trim: true,
    default: null,
    index: true
  },
  source: {
    type: String,
    trim: true,
    default: 'internal',
    lowercase: true,
    index: true
  },
  sourceUrl: {
    type: String,
    trim: true,
    default: ''
  },
  applicationUrl: {
    type: String,
    trim: true,
    default: ''
  },
  mode: {
    type: String,
    trim: true,
    enum: ['ONLINE', 'OFFLINE', 'HYBRID', 'Online', 'Offline', 'Hybrid', 'Remote', 'In-Person', ''],
    default: 'ONLINE'
  },
  status: {
    type: String,
    trim: true,
    enum: ['ACTIVE', 'CLOSING_SOON', 'EXPIRED', 'INACTIVE', 'ARCHIVED', 'active', 'closing_soon', 'expired', 'inactive', 'archived'],
    default: 'ACTIVE',
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  stipend: {
    type: String,
    trim: true,
    default: ''
  },
  fee: {
    type: String,
    trim: true,
    default: null
  },
  startDate: {
    type: Date,
    default: null
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  externalApplicantCount: {
    type: Number,
    default: null
  },
  externalStats: {
    source: {
      type: String,
      default: null,
      trim: true
    },
    applicantCount: {
      type: Number,
      default: null
    },
    lastVerifiedAt: {
      type: Date,
      default: null
    }
  },

  // Core Opportunity Fields (Preserved for full backward compatibility)
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    trim: true,
    enum: ALLOWED_TYPES,
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
    default: null
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

// Composite Unique Index on { source: 1, externalId: 1 } for non-empty externalIds
opportunitySchema.index(
  { source: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalId: { $type: 'string', $gt: '' }
    }
  }
);

// Pre-save deduplication check and URL/stipend bidirectional compatibility
opportunitySchema.pre('save', async function(next) {
  if (this.externalId && this.source) {
    const existing = await this.constructor.findOne({
      source: this.source,
      externalId: this.externalId,
      _id: { $ne: this._id }
    });
    if (existing) {
      const err = new Error(`Duplicate opportunity: source "${this.source}" and externalId "${this.externalId}" already exists.`);
      err.code = 11000;
      return next(err);
    }
  }

  // Cross-populate URLs to maintain 100% backward compatibility
  if (!this.applicationUrl && this.officialUrl) {
    this.applicationUrl = this.officialUrl;
  } else if (!this.officialUrl && this.applicationUrl) {
    this.officialUrl = this.applicationUrl;
  }

  // Cross-populate stipend / reward
  if (!this.stipend && this.stipendOrReward) {
    this.stipend = this.stipendOrReward;
  } else if (!this.stipendOrReward && this.stipend) {
    this.stipendOrReward = this.stipend;
  }

  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('Opportunity', opportunitySchema);
