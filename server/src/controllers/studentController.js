const mongoose = require('mongoose');
const Student = require('../models/Student');
const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Interaction = require('../models/Interaction');
const { evaluateEligibility } = require('../services/eligibilityService');
const { syncToDisk } = require('../config/dbPersistence');

/**
 * POST /student/profile
 * Create or update student academic profile for the verified Firebase user
 */
exports.createOrUpdateProfile = async (req, res) => {
  try {
    const { name, department, year, cgpa, skills, interests, preferredLocation } = req.body;
    const firebaseUID = req.firebaseUID;
    const firebaseEmail = req.firebaseEmail || req.student?.email;

    if (!firebaseUID) {
      return res.status(401).json({ message: 'Unauthorized. Firebase UID missing from verified token.' });
    }

    let student = await Student.findOne({ firebaseUID });

    if (!student) {
      student = new Student({
        firebaseUID,
        name: name ? name.trim() : 'Student',
        email: firebaseEmail ? firebaseEmail.toLowerCase().trim() : `${firebaseUID}@firebaseuser.com`,
        department: department ? department.trim() : '',
        year: year !== undefined ? Number(year) : 1,
        cgpa: cgpa !== undefined ? Number(cgpa) : 0,
        skills: Array.isArray(skills) ? skills : [],
        interests: Array.isArray(interests) ? interests : [],
        preferredLocation: typeof preferredLocation === 'string' ? preferredLocation.trim() : ''
      });
    } else {
      if (name) student.name = name.trim();
      if (firebaseEmail && !student.email) student.email = firebaseEmail.toLowerCase().trim();
      if (department !== undefined) student.department = department.trim();
      if (year !== undefined) student.year = Number(year);
      if (cgpa !== undefined) student.cgpa = Number(cgpa);
      if (skills !== undefined) student.skills = Array.isArray(skills) ? skills : [];
      if (interests !== undefined) student.interests = Array.isArray(interests) ? interests : [];
      if (preferredLocation !== undefined) student.preferredLocation = typeof preferredLocation === 'string' ? preferredLocation.trim() : '';
    }

    await student.save();
    await syncToDisk();

    return res.status(200).json({
      message: 'Student profile synchronized successfully.',
      student
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ message: 'Error updating student profile.', error: error.message });
  }
};

/**
 * GET /student/profile
 * Fetch current verified student profile from MongoDB
 */
exports.getProfile = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(404).json({ 
        message: 'Student profile not found. Please complete your registration profile.' 
      });
    }
    return res.status(200).json(student);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ message: 'Error fetching profile.', error: error.message });
  }
};

/**
 * GET /student/applications
 * Fetch application history for current verified student
 */
exports.getApplications = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found.' });
    }

    const applications = await Application.find({ studentId: student._id })
      .populate('opportunityId')
      .sort({ submissionDate: -1 });

    return res.status(200).json(applications);
  } catch (error) {
    console.error('Error fetching student applications:', error);
    return res.status(500).json({ message: 'Error fetching applications.', error: error.message });
  }
};

/**
 * GET /student/bookmarks
 * Fetch bookmarked opportunities for current student
 */
exports.getBookmarks = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found.' });
    }

    const populated = await Student.findById(student._id).populate('bookmarks');
    return res.status(200).json(populated.bookmarks || []);
  } catch (error) {
    console.error('Error fetching student bookmarks:', error);
    return res.status(500).json({ message: 'Error fetching bookmarks.', error: error.message });
  }
};

/**
 * POST /student/bookmarks/:opportunityId (or POST /student/bookmarks with body)
 * Add or toggle bookmark on an opportunity
 */
exports.toggleBookmark = async (req, res) => {
  try {
    const student = req.student;
    const opportunityId = req.params.opportunityId || req.body.opportunityId;

    if (!student) {
      return res.status(401).json({ message: 'Student authentication required.' });
    }

    if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
      return res.status(404).json({ message: 'Valid opportunityId is required.' });
    }

    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      return res.status(404).json({ message: 'Opportunity not found.' });
    }

    const oppIdStr = opportunity._id.toString();
    const currentBookmarks = Array.isArray(student.bookmarks) ? student.bookmarks : [];
    const isBookmarked = currentBookmarks.some(id => id.toString() === oppIdStr);

    let action = 'BOOKMARK';
    if (isBookmarked) {
      student.bookmarks = currentBookmarks.filter(id => id.toString() !== oppIdStr);
      action = 'UNBOOKMARK';
    } else {
      student.bookmarks = [...currentBookmarks, opportunity._id];
      action = 'BOOKMARK';
    }

    await student.save();

    // Record interaction event
    try {
      const interaction = new Interaction({
        studentId: student._id,
        opportunityId: opportunity._id,
        interactionType: action,
        timestamp: new Date(),
        metadata: { source: 'student-bookmark-toggle' }
      });
      await interaction.save();
    } catch (err) {
      console.warn('Analytics notice:', err.message);
    }

    await syncToDisk();

    return res.status(200).json({
      message: action === 'BOOKMARK' ? 'Opportunity bookmarked successfully.' : 'Opportunity removed from bookmarks.',
      action,
      bookmarked: action === 'BOOKMARK',
      bookmarks: student.bookmarks
    });
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    return res.status(500).json({ message: 'Error updating bookmark.', error: error.message });
  }
};

/**
 * DELETE /student/bookmarks/:opportunityId
 * Explicitly remove an opportunity from bookmarks
 */
exports.removeBookmark = async (req, res) => {
  try {
    const student = req.student;
    const opportunityId = req.params.opportunityId;

    if (!student) {
      return res.status(401).json({ message: 'Student authentication required.' });
    }

    if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
      return res.status(404).json({ message: 'Valid opportunityId is required.' });
    }

    const oppIdStr = opportunityId.toString();
    const currentBookmarks = Array.isArray(student.bookmarks) ? student.bookmarks : [];
    student.bookmarks = currentBookmarks.filter(id => id.toString() !== oppIdStr);
    await student.save();

    try {
      const interaction = new Interaction({
        studentId: student._id,
        opportunityId,
        interactionType: 'UNBOOKMARK',
        timestamp: new Date(),
        metadata: { source: 'student-bookmark-remove' }
      });
      await interaction.save();
    } catch (err) {
      console.warn('Analytics notice:', err.message);
    }

    await syncToDisk();

    return res.status(200).json({
      message: 'Opportunity removed from bookmarks.',
      bookmarked: false,
      bookmarks: student.bookmarks
    });
  } catch (error) {
    console.error('Error removing bookmark:', error);
    return res.status(500).json({ message: 'Error removing bookmark.', error: error.message });
  }
};

/**
 * GET /student/analytics
 * Student-facing personalized application analytics and opportunity insights
 */
exports.getStudentAnalytics = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const studentId = student._id;
    const now = new Date();

    // 1. Personal Applications Breakdown
    const studentApps = await Application.find({ studentId })
      .populate('opportunityId', 'title organization type deadline status isActive externalApplicantCount externalStats')
      .sort({ submissionDate: -1 })
      .lean();

    const totalApplications = studentApps.length;
    let submitted = 0;
    let underReview = 0;
    let accepted = 0;
    let rejected = 0;

    studentApps.forEach(app => {
      const st = (app.status || '').toLowerCase().trim();
      if (st === 'accepted') accepted++;
      else if (st === 'under review' || st === 'under_review') underReview++;
      else if (st === 'rejected') rejected++;
      else submitted++;
    });

    const activePending = submitted + underReview;
    const completed = accepted + rejected;

    const recentApplications = studentApps.slice(0, 10).map(app => {
      const opp = app.opportunityId;
      const oppExists = Boolean(opp && opp._id);
      return {
        _id: app._id,
        opportunityId: oppExists ? opp._id : null,
        title: oppExists ? opp.title : (app.opportunityTitle || 'Opportunity archived'),
        organization: oppExists ? opp.organization : (app.opportunityOrg || 'Institution Partner'),
        type: oppExists ? opp.type : (app.opportunityType || 'internship'),
        status: app.status || 'Submitted',
        submissionDate: app.submissionDate,
        deadline: oppExists ? opp.deadline : null,
        isArchived: !oppExists
      };
    });

    // 2. Upcoming Deadlines for Bookmarked Opportunities
    const bookmarkedIds = Array.isArray(student.bookmarks) ? student.bookmarks : [];
    let bookmarkedDeadlines = [];
    if (bookmarkedIds.length > 0) {
      const bookmarkedOpps = await Opportunity.find({
        _id: { $in: bookmarkedIds },
        isActive: { $ne: false },
        status: { $nin: ['INACTIVE', 'ARCHIVED'] },
        deadline: { $ne: null, $gte: now }
      })
        .sort({ deadline: 1 })
        .limit(10)
        .lean();

      bookmarkedDeadlines = bookmarkedOpps.map(opp => {
        const daysRemaining = Math.max(0, Math.ceil((new Date(opp.deadline) - now) / (1000 * 60 * 60 * 24)));
        return {
          _id: opp._id,
          title: opp.title,
          organization: opp.organization,
          type: opp.type,
          deadline: opp.deadline,
          daysRemaining,
          isBookmarked: true
        };
      });
    }

    // 3. Personalized Eligibility & Opportunity Matching
    // Aligned scope: Exclude inactive/archived and expired opportunities consistently with recommendation engine
    const rawActiveOpportunities = await Opportunity.find({
      isActive: { $ne: false },
      status: { $nin: ['INACTIVE', 'inactive', 'ARCHIVED', 'archived'] }
    }).lean();

    const activeOpportunities = rawActiveOpportunities.filter(opp => {
      if (!opp.deadline) return true;
      const d = new Date(opp.deadline);
      return isNaN(d.getTime()) || d >= now;
    });

    let eligibleCount = 0;
    let ineligibleCount = 0;
    let incompleteProfileCount = 0;
    let skillMatchCount = 0;

    const studentSkills = Array.isArray(student.skills) ? student.skills.map(s => s.toLowerCase().trim()).filter(Boolean) : [];
    const studentDept = (student.department || '').toLowerCase().trim();

    for (const opp of activeOpportunities) {
      const evalResult = evaluateEligibility(student, opp);
      if (evalResult.status === 'eligible') {
        eligibleCount++;
      } else if (evalResult.status === 'ineligible') {
        ineligibleCount++;
      } else if (evalResult.status === 'incomplete_profile') {
        incompleteProfileCount++;
      }

      // Validated skill matching: Opportunity requires skills and student has at least one matching skill
      const oppSkills = (opp.eligibility?.skills || []).map(s => s.toLowerCase().trim()).filter(Boolean);
      const hasActualSkillMatch = oppSkills.length > 0 && oppSkills.some(req =>
        studentSkills.some(st => st === req || req.includes(st) || st.includes(req))
      );
      if (hasActualSkillMatch) {
        skillMatchCount++;
      }
    }

    // 4. Suggested Next Actions
    const suggestedActions = [];
    if (totalApplications === 0) {
      suggestedActions.push({
        id: 'start-applying',
        action: 'Submit your first application',
        description: 'Explore opportunities recommended for your profile and submit your first application.',
        link: '/recommended'
      });
    } else if (activePending > 0) {
      suggestedActions.push({
        id: 'track-active',
        action: `Review ${activePending} in-progress ${activePending === 1 ? 'application' : 'applications'}`,
        description: 'Check review statuses and monitor application progress.',
        link: '/applications'
      });
    }

    const urgentDeadlines = bookmarkedDeadlines.filter(b => b.daysRemaining <= 7);
    if (urgentDeadlines.length > 0) {
      suggestedActions.push({
        id: 'urgent-saved',
        action: `${urgentDeadlines.length} saved ${urgentDeadlines.length === 1 ? 'opportunity closes' : 'opportunities close'} this week`,
        description: 'Submit your application before the deadline passes.',
        link: '/browse?saved=true'
      });
    }

    if (!student.department || !student.year || !student.cgpa || studentSkills.length === 0) {
      suggestedActions.push({
        id: 'update-profile',
        action: 'Complete your profile requirements',
        description: 'Add missing academic details or technical skills to ensure accurate eligibility evaluations.',
        link: '/profile'
      });
    }

    // 5. Platform Opportunity Statistics (EduConnect-wide aggregate)
    // Top applied opportunities
    const topAppliedAgg = await Application.aggregate([
      {
        $group: {
          _id: '$opportunityId',
          applicationsCount: { $sum: 1 },
          uniqueApplicants: { $addToSet: '$studentId' }
        }
      },
      {
        $project: {
          opportunityId: '$_id',
          applicationsCount: 1,
          uniqueApplicantsCount: { $size: '$uniqueApplicants' },
          _id: 0
        }
      },
      { $sort: { applicationsCount: -1 } },
      { $limit: 10 }
    ]);

    const topOppIds = topAppliedAgg.map(i => i.opportunityId);
    const oppRecords = await Opportunity.find({ _id: { $in: topOppIds } })
      .select('_id title organization type deadline status location stipendOrReward externalApplicantCount externalStats source')
      .lean();
    const oppMap = new Map(oppRecords.map(o => [o._id.toString(), o]));

    const topAppliedOpportunities = topAppliedAgg.map(item => {
      const opp = oppMap.get(item.opportunityId.toString());
      if (!opp) return null; // Exclude deleted opportunities to prevent broken links
      const extCount = opp.externalApplicantCount !== undefined && opp.externalApplicantCount !== null
        ? opp.externalApplicantCount
        : (opp.externalStats?.applicantCount ?? null);

      return {
        _id: item.opportunityId,
        title: opp.title || 'Opportunity',
        organization: opp.organization || 'Institution Partner',
        type: opp.type || 'internship',
        deadline: opp.deadline || null,
        status: opp.status || 'ACTIVE',
        applicationsCount: item.applicationsCount,
        uniqueApplicantsCount: item.uniqueApplicantsCount,
        externalApplicantCount: extCount,
        externalStats: {
          source: opp.externalStats?.source || (opp.source && opp.source !== 'internal' ? opp.source : null),
          applicantCount: extCount,
          lastVerifiedAt: opp.externalStats?.lastVerifiedAt || opp.lastUpdated || null
        }
      };
    }).filter(Boolean);

    // Application trends over time (monthly aggregation)
    const trendsAgg = await Application.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$submissionDate' }
          },
          applicationCount: { $sum: 1 },
          uniqueStudents: { $addToSet: '$studentId' }
        }
      },
      {
        $project: {
          period: '$_id',
          applicationCount: 1,
          uniqueStudentsCount: { $size: '$uniqueStudents' },
          _id: 0
        }
      },
      { $sort: { period: 1 } }
    ]);

    // Opportunity categories with highest application activity
    const categoryActivityAgg = await Application.aggregate([
      {
        $group: {
          _id: { $toLower: { $ifNull: ['$opportunityType', 'other'] } },
          applicationCount: { $sum: 1 },
          uniqueStudents: { $addToSet: '$studentId' }
        }
      },
      {
        $project: {
          category: '$_id',
          applicationCount: 1,
          uniqueStudentsCount: { $size: '$uniqueStudents' },
          _id: 0
        }
      },
      { $sort: { applicationCount: -1 } }
    ]);

    // Available opportunities per category
    const categoryCatalogAgg = await Opportunity.aggregate([
      { $match: { isActive: { $ne: false }, status: { $nin: ['INACTIVE', 'ARCHIVED'] } } },
      {
        $group: {
          _id: { $toLower: '$type' },
          opportunityCount: { $sum: 1 }
        }
      }
    ]);
    const catCountMap = new Map(categoryCatalogAgg.map(c => [c._id, c.opportunityCount]));

    const categoryActivity = categoryActivityAgg.map(c => ({
      category: c.category,
      applicationCount: c.applicationCount,
      uniqueStudentsCount: c.uniqueStudentsCount,
      availableOpportunitiesCount: catCountMap.get(c.category) || 0
    }));

    const totalPlatformApplications = await Application.countDocuments();
    const distinctPlatformApplicants = (await Application.distinct('studentId')).length;

    return res.status(200).json({
      personal: {
        totalApplications,
        activePending,
        accepted,
        rejected,
        statusBreakdown: {
          submitted,
          underReview,
          accepted,
          rejected
        },
        recentApplications,
        bookmarkedDeadlines,
        matchingInsights: {
          matchingCount: skillMatchCount,
          skillMatchCount,
          eligibleCount,
          ineligibleCount,
          incompleteProfileCount,
          totalEvaluated: activeOpportunities.length
        },
        suggestedActions
      },
      platform: {
        totalApplications: totalPlatformApplications,
        uniqueStudentsCount: distinctPlatformApplicants,
        topAppliedOpportunities,
        popularOpportunities: topAppliedOpportunities,
        trends: trendsAgg,
        categoryActivity
      }
    });
  } catch (error) {
    console.error('Error fetching student analytics:', error);
    return res.status(500).json({ message: 'Error calculating student analytics', error: error.message });
  }
};

