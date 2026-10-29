const mongoose = require('mongoose');
const Interaction = require('../models/Interaction');
const Opportunity = require('../models/Opportunity');
const Student = require('../models/Student');
const { sanitizeMetadata } = require('../utils/sanitizeMetadata');
const { syncToDisk } = require('../config/dbPersistence');

const ALLOWED_TYPES = [
  'VIEW',
  'CLICK',
  'BOOKMARK',
  'UNBOOKMARK',
  'APPLY',
  'DISMISS'
];

/**
 * POST /api/interactions
 * Records a student interaction event.
 * 
 * - Derives student identity securely from verified authentication (req.student)
 * - Verifies opportunity existence before saving
 * - Enforces canonical uppercase interaction types
 * - Generates authoritative server timestamp
 * - Sanitizes metadata to strip sensitive fields
 * - Handles bookmark state transitions idempotently
 */
exports.recordInteraction = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ 
        message: 'Student authentication required. Please sign in or register your student profile.' 
      });
    }

    const { opportunityId, interactionType, metadata } = req.body;

    // 1. Validate opportunityId presence and format
    if (!opportunityId) {
      return res.status(400).json({ message: 'opportunityId is required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(opportunityId)) {
      return res.status(404).json({ message: 'Opportunity not found with the provided identifier.' });
    }

    // 2. Validate interactionType
    if (!interactionType || typeof interactionType !== 'string') {
      return res.status(400).json({ 
        message: `interactionType is required. Valid canonical types are: ${ALLOWED_TYPES.join(', ')}` 
      });
    }

    if (!ALLOWED_TYPES.includes(interactionType)) {
      return res.status(400).json({ 
        message: `Invalid interactionType "${interactionType}". Must be one of: ${ALLOWED_TYPES.join(', ')}` 
      });
    }

    // 3. Verify opportunity exists in database
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      return res.status(404).json({ message: 'Opportunity not found.' });
    }

    // 4. Sanitize metadata
    const sanitizedMeta = sanitizeMetadata(metadata);

    // 5. Update student bookmark state if applicable
    if (interactionType === 'BOOKMARK') {
      const oppIdStr = opportunity._id.toString();
      const currentBookmarks = Array.isArray(student.bookmarks) ? student.bookmarks : [];
      const alreadyBookmarked = currentBookmarks.some(id => id.toString() === oppIdStr);

      if (!alreadyBookmarked) {
        student.bookmarks = [...currentBookmarks, opportunity._id];
        await student.save();
      }
    } else if (interactionType === 'UNBOOKMARK') {
      const oppIdStr = opportunity._id.toString();
      const currentBookmarks = Array.isArray(student.bookmarks) ? student.bookmarks : [];
      student.bookmarks = currentBookmarks.filter(id => id.toString() !== oppIdStr);
      await student.save();
    }

    // 6. Record interaction with authoritative server timestamp
    const interaction = new Interaction({
      studentId: student._id,
      opportunityId: opportunity._id,
      interactionType,
      timestamp: new Date(),
      metadata: sanitizedMeta
    });

    await interaction.save();
    await syncToDisk();

    return res.status(201).json({
      message: 'Interaction recorded successfully.',
      interaction
    });
  } catch (error) {
    console.error('Error recording student interaction:', error);
    return res.status(500).json({ 
      message: 'Internal server error while recording interaction.', 
      error: error.message 
    });
  }
};

/**
 * GET /api/interactions
 * Retrieves interaction history for the authenticated student with pagination and filtering.
 */
exports.getStudentInteractions = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Student authentication required.' });
    }

    const { interactionType, opportunityId, startDate, endDate } = req.query;

    const filter = {
      studentId: student._id
    };

    if (interactionType && ALLOWED_TYPES.includes(interactionType)) {
      filter.interactionType = interactionType;
    }

    if (opportunityId && mongoose.Types.ObjectId.isValid(opportunityId)) {
      filter.opportunityId = opportunityId;
    }

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate);
      }
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const total = await Interaction.countDocuments(filter);
    const interactions = await Interaction.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('opportunityId', 'title type organization location deadline officialUrl applicationUrl');

    return res.status(200).json({
      data: interactions,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    console.error('Error fetching student interactions:', error);
    return res.status(500).json({ 
      message: 'Internal server error while retrieving interaction history.', 
      error: error.message 
    });
  }
};

/**
 * GET /api/interactions/summary
 * Provides aggregated interaction statistics for the authenticated student.
 */
exports.getInteractionSummary = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Student authentication required.' });
    }

    const studentId = student._id;
    const interactions = await Interaction.find({ studentId }).lean();

    let totalViews = 0;
    let totalClicks = 0;
    let totalBookmarks = 0;
    let totalUnbookmarks = 0;
    let totalApplications = 0;
    let totalDismissals = 0;

    for (const it of interactions) {
      switch (it.interactionType) {
        case 'VIEW': totalViews++; break;
        case 'CLICK': totalClicks++; break;
        case 'BOOKMARK': totalBookmarks++; break;
        case 'UNBOOKMARK': totalUnbookmarks++; break;
        case 'APPLY': totalApplications++; break;
        case 'DISMISS': totalDismissals++; break;
      }
    }

    return res.status(200).json({
      studentId: studentId,
      totalInteractions: interactions.length,
      summary: {
        totalViews,
        totalClicks,
        totalBookmarks,
        totalUnbookmarks,
        totalApplications,
        totalDismissals
      },
      byType: {
        VIEW: totalViews,
        CLICK: totalClicks,
        BOOKMARK: totalBookmarks,
        UNBOOKMARK: totalUnbookmarks,
        APPLY: totalApplications,
        DISMISS: totalDismissals
      }
    });
  } catch (error) {
    console.error('Error fetching interaction summary:', error);
    return res.status(500).json({ 
      message: 'Internal server error while calculating interaction summary.', 
      error: error.message 
    });
  }
};
