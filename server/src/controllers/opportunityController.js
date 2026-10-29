const Opportunity = require('../models/Opportunity');
const Recommendation = require('../models/Recommendation');
const Interaction = require('../models/Interaction');
const Application = require('../models/Application');
const Student = require('../models/Student');
const { evaluateEligibility } = require('../services/eligibilityService');
const { generateRecommendations } = require('../services/recommendationEngine');
const { generateMLRecommendations } = require('../services/mlRecommendationEngine');
const { generateRFRecommendations } = require('../services/rfRecommenderService');
const { syncToDisk } = require('../config/dbPersistence');
const { parseAndMapCsv } = require('../utils/csvParser');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /opportunities
 * Fetch opportunities with optional search, filters, sorting, and pagination
 */
exports.getOpportunities = async (req, res) => {
  try {
    const {
      type,
      department,
      search,
      minCGPA,
      source,
      status,
      includeInactive,
      sort,
      page,
      limit = 20
    } = req.query;

    const query = {};

    // Filter by opportunity type
    if (type && type !== 'all') {
      query.type = { $in: [type.toLowerCase(), type.toUpperCase()] };
    }

    // Filter by academic department
    if (department && department !== 'all') {
      query['eligibility.department'] = { $in: [department, 'All', 'all', 'Any', 'any'] };
    }

    // Filter by minCGPA
    if (minCGPA) {
      query['eligibility.minCGPA'] = { $lte: Number(minCGPA) };
    }

    // Filter by source
    if (source && source !== 'all') {
      query.source = source.toLowerCase();
    }

    // Filter by status / active state
    if (status && status !== 'all') {
      query.status = { $in: [status.toUpperCase(), status.toLowerCase()] };
    } else if (includeInactive !== 'true') {
      // By default, exclude inactive opportunities for students/public catalog
      query.isActive = { $ne: false };
      query.status = { $nin: ['INACTIVE', 'inactive', 'ARCHIVED', 'archived'] };
    }

    // Search filter across title, description, org, skills, tags
    if (search && search.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { organization: searchRegex },
        { 'eligibility.skills': searchRegex },
        { tags: searchRegex }
      ];
    }

    // Sorting
    let sortOptions = { postedDate: -1, deadline: 1 };
    if (sort === 'deadline_asc') {
      sortOptions = { deadline: 1 };
    } else if (sort === 'deadline_desc') {
      sortOptions = { deadline: -1 };
    } else if (sort === 'posted_desc') {
      sortOptions = { postedDate: -1 };
    } else if (sort === 'posted_asc') {
      sortOptions = { postedDate: 1 };
    } else if (sort === 'title_asc') {
      sortOptions = { title: 1 };
    }

    // Server-side pagination if `page` parameter is supplied
    if (page !== undefined && page !== null && page !== '') {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const [total, opportunities] = await Promise.all([
        Opportunity.countDocuments(query),
        Opportunity.find(query).sort(sortOptions).skip(skip).limit(limitNum)
      ]);

      return res.status(200).json({
        opportunities,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      });
    }

    // Non-paginated array return for 100% backward compatibility
    const opportunities = await Opportunity.find(query).sort(sortOptions);
    return res.status(200).json(opportunities);
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return res.status(500).json({ message: 'Error fetching opportunities', error: error.message });
  }
};

/**
 * GET /opportunities/:id/eligibility
 * Check eligibility of the authenticated student for a specific opportunity
 */
exports.checkEligibility = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const opportunity = await Opportunity.findById(req.params.id);
    if (!opportunity) {
      return res.status(404).json({ message: 'Opportunity not found' });
    }

    const evaluation = evaluateEligibility(student, opportunity);

    return res.status(200).json({
      opportunityId: opportunity._id,
      opportunityTitle: opportunity.title,
      studentId: student._id,
      ...evaluation
    });
  } catch (error) {
    console.error('Error evaluating eligibility:', error);
    return res.status(500).json({ message: 'Error evaluating eligibility', error: error.message });
  }
};

/**
 * GET /opportunities/:id
 * Fetch single opportunity details with aggregate engagement analytics
 */
exports.getOpportunityById = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id);
    if (!opportunity) {
      return res.status(404).json({ message: 'Opportunity not found' });
    }

    // Aggregate engagement statistics (strict privacy: zero student identity exposed)
    const [applicationsCount, uniqueApplicants, bookmarksCount] = await Promise.all([
      Application.countDocuments({ opportunityId: opportunity._id }),
      Application.distinct('studentId', { opportunityId: opportunity._id }),
      Student.countDocuments({ bookmarks: opportunity._id })
    ]);

    const oppObj = opportunity.toObject();
    oppObj.applicationsCount = applicationsCount;
    oppObj.uniqueApplicantsCount = uniqueApplicants.length;
    oppObj.bookmarksCount = bookmarksCount;

    // External applicant statistics (preserved strictly without invention)
    const extCount = opportunity.externalApplicantCount !== undefined && opportunity.externalApplicantCount !== null
      ? opportunity.externalApplicantCount
      : (opportunity.externalStats?.applicantCount ?? null);

    oppObj.externalApplicantCount = extCount;
    oppObj.externalStats = {
      source: opportunity.externalStats?.source || (opportunity.source && opportunity.source !== 'internal' ? opportunity.source : null),
      applicantCount: extCount,
      lastVerifiedAt: opportunity.externalStats?.lastVerifiedAt || opportunity.fetchedAt || opportunity.lastUpdated || null
    };

    return res.status(200).json(oppObj);
  } catch (error) {
    console.error('Error fetching opportunity by ID:', error);
    return res.status(500).json({ message: 'Error fetching opportunity', error: error.message });
  }
};

/**
 * GET /opportunities/:id/engagement
 * Fetch aggregate student engagement statistics for a specific opportunity
 */
exports.getEngagement = async (req, res) => {
  try {
    const { id } = req.params;
    const opp = await Opportunity.findById(id).select('_id title source externalApplicantCount externalStats fetchedAt lastUpdated');
    if (!opp) {
      return res.status(404).json({ message: 'Opportunity not found' });
    }

    const [applicationsCount, uniqueApplicants, bookmarksCount] = await Promise.all([
      Application.countDocuments({ opportunityId: id }),
      Application.distinct('studentId', { opportunityId: id }),
      Student.countDocuments({ bookmarks: id })
    ]);

    const extCount = opp.externalApplicantCount !== undefined && opp.externalApplicantCount !== null
      ? opp.externalApplicantCount
      : (opp.externalStats?.applicantCount ?? null);

    return res.status(200).json({
      opportunityId: id,
      title: opp.title,
      applicationsCount,
      uniqueApplicantsCount: uniqueApplicants.length,
      bookmarksCount,
      externalApplicantCount: extCount,
      externalStats: {
        source: opp.externalStats?.source || (opp.source && opp.source !== 'internal' ? opp.source : null),
        applicantCount: extCount,
        lastVerifiedAt: opp.externalStats?.lastVerifiedAt || opp.fetchedAt || opp.lastUpdated || null
      }
    });
  } catch (error) {
    console.error('Error fetching engagement analytics:', error);
    return res.status(500).json({ message: 'Error fetching engagement analytics', error: error.message });
  }
};

/**
 * GET /opportunities/admin/analytics
 * Fetch administrator opportunity catalog and engagement metrics
 */
exports.getAdminAnalytics = async (req, res) => {
  try {
    const now = new Date();

    const [
      totalOpportunities,
      activeOpportunities,
      inactiveOpportunities,
      expiredOpportunities,
      totalApplications,
      totalStudents,
      totalBookmarksRes,
      sourceAgg,
      typeAgg,
      applicationStatusAgg,
      trendsAgg,
      categoryActivityAgg,
      categoryCatalogAgg
    ] = await Promise.all([
      Opportunity.countDocuments(),
      Opportunity.countDocuments({ isActive: true, status: { $ne: 'INACTIVE' } }),
      Opportunity.countDocuments({ $or: [{ isActive: false }, { status: 'INACTIVE' }] }),
      Opportunity.countDocuments({ deadline: { $ne: null, $lt: now } }),
      Application.countDocuments(),
      Student.countDocuments({ role: 'student' }),
      Student.aggregate([
        { $project: { bookmarkCount: { $size: { $ifNull: ['$bookmarks', []] } } } },
        { $group: { _id: null, total: { $sum: '$bookmarkCount' } } }
      ]),
      Opportunity.aggregate([
        { $group: { _id: { $ifNull: ['$source', 'internal'] }, count: { $sum: 1 } } }
      ]),
      Opportunity.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Application.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Application.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$submissionDate' } },
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
      ]),
      Application.aggregate([
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
      ]),
      Opportunity.aggregate([
        { $match: { isActive: { $ne: false }, status: { $nin: ['INACTIVE', 'ARCHIVED'] } } },
        {
          $group: {
            _id: { $toLower: '$type' },
            opportunityCount: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalBookmarks = totalBookmarksRes?.[0]?.total || 0;

    // Top applied opportunities
    const topAppliedAgg = await Application.aggregate([
      { $group: { _id: '$opportunityId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Top bookmarked opportunities
    const topBookmarkedAgg = await Student.aggregate([
      { $unwind: '$bookmarks' },
      { $group: { _id: '$bookmarks', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Populate titles for top opportunities
    const oppIdsToFetch = [
      ...topAppliedAgg.map(a => a._id),
      ...topBookmarkedAgg.map(b => b._id)
    ].filter(Boolean);

    const oppsMap = new Map();
    if (oppIdsToFetch.length > 0) {
      const opps = await Opportunity.find({ _id: { $in: oppIdsToFetch } })
        .select('title organization type status deadline source')
        .lean();
      opps.forEach(o => oppsMap.set(o._id.toString(), o));
    }

    const topApplied = topAppliedAgg
      .map(item => {
        const opp = oppsMap.get(item._id?.toString());
        if (!opp) return null; // Exclude deleted/orphaned opportunities to prevent broken links
        return {
          // Expose _id directly so frontend links work: /opportunity/:_id
          _id: item._id,
          opportunityId: item._id,
          count: item.count,
          title: opp.title || 'Untitled Opportunity',
          organization: opp.organization || '',
          type: opp.type || '',
          status: opp.status || 'ACTIVE'
        };
      })
      .filter(Boolean);

    const topBookmarked = topBookmarkedAgg
      .map(item => {
        const opp = oppsMap.get(item._id?.toString());
        if (!opp) return null; // Exclude deleted/orphaned opportunities
        return {
          _id: item._id,
          opportunityId: item._id,
          count: item.count,
          title: opp.title || 'Untitled Opportunity',
          organization: opp.organization || '',
          type: opp.type || '',
          status: opp.status || 'ACTIVE'
        };
      })
      .filter(Boolean);

    const sources = {};
    sourceAgg.forEach(s => { sources[s._id] = s.count; });

    const types = {};
    typeAgg.forEach(t => { types[t._id] = t.count; });

    const applicationStatusDistribution = {};
    applicationStatusAgg.forEach(s => { applicationStatusDistribution[s._id || 'Unknown'] = s.count; });

    const catCountMap = new Map(categoryCatalogAgg.map(c => [c._id, c.opportunityCount]));
    const categoryActivity = categoryActivityAgg.map(c => ({
      category: c.category,
      applicationCount: c.applicationCount,
      uniqueStudentsCount: c.uniqueStudentsCount,
      availableOpportunitiesCount: catCountMap.get(c.category) || 0
    }));

    const totals = {
      totalOpportunities,
      activeOpportunities,
      inactiveOpportunities,
      expiredOpportunities,
      totalApplications,
      totalStudents,
      totalBookmarks
    };

    return res.status(200).json({
      totals,
      summary: totals,
      sources,
      types,
      applicationStatusDistribution,
      topApplied: topApplied.map(t => ({ ...t, applicationsCount: t.count })),
      topBookmarked: topBookmarked.map(b => ({ ...b, bookmarksCount: b.count })),
      trends: trendsAgg,
      categoryActivity
    });
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    return res.status(500).json({ message: 'Error fetching admin analytics', error: error.message });
  }
};

/**
 * GET /opportunities/insights
 * Public / Student-facing opportunity statistics and platform activity (zero student PII)
 */
exports.getOpportunityInsights = async (req, res) => {
  try {
    const [
      totalApplications,
      uniqueStudentsAgg,
      topAppliedAgg,
      trendsAgg,
      categoryActivityAgg,
      categoryCatalogAgg
    ] = await Promise.all([
      Application.countDocuments(),
      Application.distinct('studentId'),
      Application.aggregate([
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
      ]),
      Application.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$submissionDate' } },
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
      ]),
      Application.aggregate([
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
      ]),
      Opportunity.aggregate([
        { $match: { isActive: { $ne: false }, status: { $nin: ['INACTIVE', 'ARCHIVED'] } } },
        {
          $group: {
            _id: { $toLower: '$type' },
            opportunityCount: { $sum: 1 }
          }
        }
      ])
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

    const catCountMap = new Map(categoryCatalogAgg.map(c => [c._id, c.opportunityCount]));
    const categoryActivity = categoryActivityAgg.map(c => ({
      category: c.category,
      applicationCount: c.applicationCount,
      uniqueStudentsCount: c.uniqueStudentsCount,
      availableOpportunitiesCount: catCountMap.get(c.category) || 0
    }));

    return res.status(200).json({
      totalApplications,
      uniqueStudentsCount: uniqueStudentsAgg.length,
      topAppliedOpportunities,
      popularOpportunities: topAppliedOpportunities,
      trends: trendsAgg,
      categoryActivity
    });
  } catch (error) {
    console.error('Error fetching opportunity insights:', error);
    return res.status(500).json({ message: 'Error fetching opportunity insights', error: error.message });
  }
};

/**
 * POST /opportunities
 * Admin-only: Create a new opportunity with full server-side validation and duplicate check
 */
exports.createOpportunity = async (req, res) => {
  try {
    const {
      title,
      organization,
      type,
      description,
      deadline,
      applicationUrl,
      officialUrl,
      location,
      mode,
      stipendOrReward,
      departments,
      minYear,
      minCGPA,
      skills,
      tags,
      source = 'admin',
      status = 'ACTIVE'
    } = req.body;

    // 1. Required field validations
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required.' });
    }
    if (!organization || !organization.trim()) {
      return res.status(400).json({ message: 'Organization is required.' });
    }
    if (!type || !type.trim()) {
      return res.status(400).json({ message: 'Opportunity type is required.' });
    }

    const normType = type.trim().toLowerCase();
    const VALID_TYPES = ['internship', 'placement', 'hackathon', 'competition', 'scholarship', 'course', 'workshop', 'certification'];
    if (!VALID_TYPES.includes(normType)) {
      return res.status(400).json({
        message: `Invalid opportunity type "${type}". Allowed types: ${VALID_TYPES.join(', ')}.`
      });
    }

    let parsedDeadline = null;
    if (deadline) {
      const d = new Date(deadline);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ message: 'Invalid deadline date format.' });
      }
      parsedDeadline = d;
    }

    const numCgpa = minCGPA !== undefined && minCGPA !== null && minCGPA !== '' ? Number(minCGPA) : 0;
    if (isNaN(numCgpa) || numCgpa < 0 || numCgpa > 10) {
      return res.status(400).json({ message: 'Minimum CGPA must be a number between 0 and 10.' });
    }

    const numYear = minYear !== undefined && minYear !== null && minYear !== '' ? Number(minYear) : 1;
    if (isNaN(numYear) || numYear < 1 || numYear > 5) {
      return res.status(400).json({ message: 'Minimum Academic Year must be a number between 1 and 5.' });
    }

    const url = (applicationUrl || officialUrl || '').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: 'Application URL must start with http:// or https://.' });
    }

    // 2. Duplicate Detection
    const duplicate = await Opportunity.findOne({
      title: { $regex: new RegExp(`^${escapeRegex(title.trim())}$`, 'i') },
      organization: { $regex: new RegExp(`^${escapeRegex(organization.trim())}$`, 'i') }
    });
    if (duplicate) {
      return res.status(409).json({
        message: `An opportunity with the title "${title.trim()}" from "${organization.trim()}" already exists.`,
        existingId: duplicate._id
      });
    }

    // 3. Assemble document
    const deptList = Array.isArray(departments)
      ? departments
      : (typeof departments === 'string' && departments.trim() ? departments.split(',').map(d => d.trim()).filter(Boolean) : ['All']);

    const skillList = Array.isArray(skills)
      ? skills
      : (typeof skills === 'string' && skills.trim() ? skills.split(',').map(s => s.trim()).filter(Boolean) : []);

    const tagList = Array.isArray(tags)
      ? tags
      : (typeof tags === 'string' && tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    const normStatus = (status || 'ACTIVE').trim().toUpperCase();
    const isActive = normStatus !== 'INACTIVE' && normStatus !== 'ARCHIVED';

    const newOpp = new Opportunity({
      title: title.trim(),
      organization: organization.trim(),
      type: normType,
      description: description.trim(),
      deadline: parsedDeadline,
      location: (location || 'Remote').trim(),
      mode: (mode || 'ONLINE').trim(),
      stipendOrReward: (stipendOrReward || '').trim(),
      officialUrl: url || 'https://educonnect.ac.in',
      applicationUrl: url || 'https://educonnect.ac.in',
      eligibility: {
        department: deptList.length > 0 ? deptList : ['All'],
        minYear: numYear,
        minCGPA: numCgpa,
        skills: skillList
      },
      tags: tagList,
      source: (source || 'admin').toLowerCase().trim(),
      status: normStatus,
      isActive,
      postedDate: new Date(),
      lastUpdated: new Date()
    });

    await newOpp.save();
    await syncToDisk();

    return res.status(201).json({
      message: 'Opportunity created successfully.',
      opportunity: newOpp
    });
  } catch (error) {
    console.error('Error creating opportunity:', error);
    return res.status(500).json({ message: 'Error creating opportunity', error: error.message });
  }
};

/**
 * PUT/PATCH /opportunities/:id
 * Admin-only: Update existing opportunity details
 */
exports.updateOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const opp = await Opportunity.findById(id);
    if (!opp) {
      return res.status(404).json({ message: 'Opportunity not found' });
    }

    const {
      title,
      organization,
      type,
      description,
      deadline,
      applicationUrl,
      officialUrl,
      location,
      mode,
      stipendOrReward,
      departments,
      minYear,
      minCGPA,
      skills,
      tags,
      status,
      isActive
    } = req.body;

    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ message: 'Title cannot be empty.' });
      opp.title = title.trim();
    }
    if (organization !== undefined) {
      if (!organization.trim()) return res.status(400).json({ message: 'Organization cannot be empty.' });
      opp.organization = organization.trim();
    }
    if (type !== undefined) {
      const normType = type.trim().toLowerCase();
      const VALID_TYPES = ['internship', 'placement', 'hackathon', 'competition', 'scholarship', 'course', 'workshop', 'certification'];
      if (!VALID_TYPES.includes(normType)) {
        return res.status(400).json({ message: `Invalid opportunity type "${type}".` });
      }
      opp.type = normType;
    }
    if (description !== undefined) {
      if (!description.trim()) return res.status(400).json({ message: 'Description cannot be empty.' });
      opp.description = description.trim();
    }
    if (deadline !== undefined) {
      if (deadline === null || deadline === '') {
        opp.deadline = null;
      } else {
        const d = new Date(deadline);
        if (isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid deadline date format.' });
        opp.deadline = d;
      }
    }
    if (applicationUrl !== undefined || officialUrl !== undefined) {
      const url = (applicationUrl || officialUrl || '').trim();
      if (url && !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ message: 'Application URL must start with http:// or https://.' });
      }
      opp.applicationUrl = url;
      opp.officialUrl = url;
    }
    if (location !== undefined) opp.location = location.trim();
    if (mode !== undefined) opp.mode = mode.trim();
    if (stipendOrReward !== undefined) {
      opp.stipendOrReward = stipendOrReward.trim();
      opp.stipend = stipendOrReward.trim();
    }
    if (departments !== undefined) {
      opp.eligibility.department = Array.isArray(departments)
        ? departments
        : (typeof departments === 'string' ? departments.split(',').map(d => d.trim()).filter(Boolean) : ['All']);
    }
    if (minYear !== undefined) {
      const y = Number(minYear);
      if (isNaN(y) || y < 1 || y > 5) return res.status(400).json({ message: 'minYear must be between 1 and 5.' });
      opp.eligibility.minYear = y;
    }
    if (minCGPA !== undefined) {
      const c = Number(minCGPA);
      if (isNaN(c) || c < 0 || c > 10) return res.status(400).json({ message: 'minCGPA must be between 0 and 10.' });
      opp.eligibility.minCGPA = c;
    }
    if (skills !== undefined) {
      opp.eligibility.skills = Array.isArray(skills)
        ? skills
        : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : []);
    }
    if (tags !== undefined) {
      opp.tags = Array.isArray(tags)
        ? tags
        : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    }
    if (status !== undefined) {
      const normStatus = status.trim().toUpperCase();
      opp.status = normStatus;
      opp.isActive = normStatus !== 'INACTIVE' && normStatus !== 'ARCHIVED';
    }
    if (isActive !== undefined) {
      opp.isActive = Boolean(isActive);
      if (!opp.isActive) opp.status = 'INACTIVE';
      else if (opp.status === 'INACTIVE') opp.status = 'ACTIVE';
    }

    opp.lastUpdated = new Date();
    await opp.save();
    await syncToDisk();

    return res.status(200).json({
      message: 'Opportunity updated successfully.',
      opportunity: opp
    });
  } catch (error) {
    console.error('Error updating opportunity:', error);
    return res.status(500).json({ message: 'Error updating opportunity', error: error.message });
  }
};

/**
 * PATCH /opportunities/:id/status
 * Admin-only: Activate or deactivate an opportunity
 */
exports.updateOpportunityStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isActive } = req.body;

    const opp = await Opportunity.findById(id);
    if (!opp) {
      return res.status(404).json({ message: 'Opportunity not found' });
    }

    if (status !== undefined) {
      const normStatus = String(status).trim().toUpperCase();
      const VALID_STATUSES = ['ACTIVE', 'CLOSING_SOON', 'EXPIRED', 'INACTIVE', 'ARCHIVED'];
      if (!VALID_STATUSES.includes(normStatus)) {
        return res.status(400).json({ message: `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}.` });
      }
      opp.status = normStatus;
      opp.isActive = normStatus !== 'INACTIVE' && normStatus !== 'ARCHIVED';
    }

    if (isActive !== undefined) {
      opp.isActive = Boolean(isActive);
      if (!opp.isActive) {
        opp.status = 'INACTIVE';
      } else if (opp.status === 'INACTIVE') {
        opp.status = 'ACTIVE';
      }
    }

    opp.lastUpdated = new Date();
    await opp.save();
    await syncToDisk();

    return res.status(200).json({
      message: `Opportunity status updated to ${opp.status}.`,
      opportunity: opp
    });
  } catch (error) {
    console.error('Error updating opportunity status:', error);
    return res.status(500).json({ message: 'Error updating opportunity status', error: error.message });
  }
};

/**
 * DELETE /opportunities/:id
 * Admin-only: Safe opportunity deletion (archives if applications exist, deletes if none)
 */
exports.deleteOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const opp = await Opportunity.findById(id);
    if (!opp) {
      return res.status(404).json({ message: 'Opportunity not found' });
    }

    // Safety check: Does this opportunity have dependent student applications?
    const applicationCount = await Application.countDocuments({ opportunityId: id });

    if (applicationCount > 0) {
      // Safe deactivation: preserve all student application records and histories!
      opp.isActive = false;
      opp.status = 'INACTIVE';
      opp.lastUpdated = new Date();
      await opp.save();
      await syncToDisk();

      return res.status(200).json({
        message: `Opportunity has ${applicationCount} active student application(s) and was safely deactivated rather than permanently deleted.`,
        isSoftDeleted: true,
        archived: true,
        applicationsCount: applicationCount,
        opportunity: opp
      });
    }

    // If zero applications exist, safe hard removal and bookmark cleanup
    await Student.updateMany({}, { $pull: { bookmarks: id } });
    await Opportunity.findByIdAndDelete(id);
    await syncToDisk();

    return res.status(200).json({
      message: 'Opportunity deleted successfully.',
      deleted: true
    });
  } catch (error) {
    console.error('Error deleting opportunity:', error);
    return res.status(500).json({ message: 'Error deleting opportunity', error: error.message });
  }
};

/**
 * POST /opportunities/import
 * Admin-only: Bulk import opportunities from CSV with row-level validation and deduplication
 */
exports.importCsvOpportunities = async (req, res) => {
  try {
    const rawCsv = req.body.csvText || req.body.csvContent || req.body.csv || '';
    const updateDuplicates = Boolean(req.body.updateDuplicates);

    if (!rawCsv || typeof rawCsv !== 'string' || !rawCsv.trim()) {
      return res.status(400).json({ message: 'CSV text content is required in request body (csvText or csvContent).' });
    }

    const { rows, totalRows, unmappedHeaders } = parseAndMapCsv(rawCsv);

    if (totalRows === 0) {
      return res.status(400).json({ message: 'No data rows found in uploaded CSV.' });
    }

    const VALID_TYPES = ['internship', 'placement', 'hackathon', 'competition', 'scholarship', 'course', 'workshop', 'certification'];

    let importedCount = 0;
    let updatedCount = 0;
    let skippedDuplicatesCount = 0;
    let failedCount = 0;
    const errors = [];
    const createdOpportunities = [];

    // Track intra-CSV duplicates
    const seenInBatch = new Set();

    for (const row of rows) {
      const rowNum = row._rowNumber || 'Unknown';

      // 1. Validate required fields
      if (!row.title || !row.title.trim()) {
        failedCount++;
        errors.push({ row: rowNum, field: 'title', reason: 'Missing required opportunity title.' });
        continue;
      }
      if (!row.organization || !row.organization.trim()) {
        failedCount++;
        errors.push({ row: rowNum, field: 'organization', reason: 'Missing required organization.' });
        continue;
      }
      if (!row.type || !row.type.trim()) {
        failedCount++;
        errors.push({ row: rowNum, field: 'type', reason: 'Missing required opportunity type.' });
        continue;
      }
      const normType = row.type.trim().toLowerCase();
      if (!VALID_TYPES.includes(normType)) {
        failedCount++;
        errors.push({ row: rowNum, field: 'type', reason: `Invalid type "${row.type}". Allowed: ${VALID_TYPES.join(', ')}.` });
        continue;
      }

      // 2. Validate deadline
      let parsedDeadline = null;
      if (row.deadline && row.deadline.trim()) {
        const d = new Date(row.deadline.trim());
        if (isNaN(d.getTime())) {
          failedCount++;
          errors.push({ row: rowNum, field: 'deadline', reason: `Invalid date format for deadline: "${row.deadline}".` });
          continue;
        }
        parsedDeadline = d;
      }

      // 3. Validate CGPA
      let numCgpa = 0;
      if (row.minCGPA !== undefined && row.minCGPA !== '') {
        numCgpa = Number(row.minCGPA);
        if (isNaN(numCgpa) || numCgpa < 0 || numCgpa > 10) {
          failedCount++;
          errors.push({ row: rowNum, field: 'minCGPA', reason: 'CGPA must be a valid number between 0 and 10.' });
          continue;
        }
      }

      // 4. Validate Academic Year
      let numYear = 1;
      if (row.minYear !== undefined && row.minYear !== '') {
        numYear = Number(row.minYear);
        if (isNaN(numYear) || numYear < 1 || numYear > 5) {
          failedCount++;
          errors.push({ row: rowNum, field: 'minYear', reason: 'Academic year must be a number between 1 and 5.' });
          continue;
        }
      }

      // 5. Intra-batch duplicate check
      const batchKey = `${row.title.toLowerCase().trim()}:::${row.organization.toLowerCase().trim()}`;
      if (seenInBatch.has(batchKey)) {
        skippedDuplicatesCount++;
        errors.push({ row: rowNum, field: 'duplicate', reason: 'Duplicate entry within the same CSV import.' });
        continue;
      }
      seenInBatch.add(batchKey);

      // 6. Database duplicate check
      const existing = await Opportunity.findOne({
        title: { $regex: new RegExp(`^${escapeRegex(row.title.trim())}$`, 'i') },
        organization: { $regex: new RegExp(`^${escapeRegex(row.organization.trim())}$`, 'i') }
      });

      const deptList = row.department
        ? (Array.isArray(row.department) ? row.department : row.department.split(',').map(d => d.trim()).filter(Boolean))
        : ['All'];

      const skillList = row.skills
        ? (Array.isArray(row.skills) ? row.skills : row.skills.split(',').map(s => s.trim()).filter(Boolean))
        : [];

      const url = (row.applicationUrl || row.officialUrl || '').trim();

      if (existing) {
        if (updateDuplicates) {
          existing.description = row.description ? row.description.trim() : existing.description;
          existing.type = normType;
          if (parsedDeadline) existing.deadline = parsedDeadline;
          if (url) {
            existing.applicationUrl = url;
            existing.officialUrl = url;
          }
          if (row.location) existing.location = row.location.trim();
          if (row.mode) existing.mode = row.mode.trim();
          if (row.stipendOrReward) existing.stipendOrReward = row.stipendOrReward.trim();
          existing.eligibility = {
            department: deptList.length > 0 ? deptList : existing.eligibility.department,
            minYear: numYear || existing.eligibility.minYear,
            minCGPA: numCgpa !== undefined ? numCgpa : existing.eligibility.minCGPA,
            skills: skillList.length > 0 ? skillList : existing.eligibility.skills
          };
          existing.lastUpdated = new Date();
          await existing.save();
          updatedCount++;
        } else {
          skippedDuplicatesCount++;
        }
        continue;
      }

      // 7. Insert new opportunity
      const newOpp = new Opportunity({
        title: row.title.trim(),
        organization: row.organization.trim(),
        type: normType,
        description: (row.description || `${row.title.trim()} opportunity by ${row.organization.trim()}`).trim(),
        deadline: parsedDeadline,
        location: (row.location || 'Remote').trim(),
        mode: (row.mode || 'ONLINE').trim(),
        stipendOrReward: (row.stipendOrReward || '').trim(),
        officialUrl: url || 'https://educonnect.ac.in',
        applicationUrl: url || 'https://educonnect.ac.in',
        eligibility: {
          department: deptList.length > 0 ? deptList : ['All'],
          minYear: numYear,
          minCGPA: numCgpa,
          skills: skillList
        },
        source: 'csv',
        status: 'ACTIVE',
        isActive: true,
        externalApplicantCount: (row.externalApplicantCount !== undefined && row.externalApplicantCount !== '' && !isNaN(Number(row.externalApplicantCount)))
          ? Math.max(0, parseInt(row.externalApplicantCount, 10))
          : null,
        externalStats: {
          source: 'csv',
          applicantCount: (row.externalApplicantCount !== undefined && row.externalApplicantCount !== '' && !isNaN(Number(row.externalApplicantCount)))
            ? Math.max(0, parseInt(row.externalApplicantCount, 10))
            : null,
          lastVerifiedAt: (row.externalApplicantCount !== undefined && row.externalApplicantCount !== '' && !isNaN(Number(row.externalApplicantCount)))
            ? new Date()
            : null
        },
        postedDate: new Date(),
        lastUpdated: new Date()
      });

      await newOpp.save();
      createdOpportunities.push(newOpp);
      importedCount++;
    }

    if (importedCount > 0 || updatedCount > 0) {
      await syncToDisk();
    }

    return res.status(200).json({
      success: true,
      totalRows,
      imported: importedCount,
      importedCount,
      updated: updatedCount,
      updatedCount,
      duplicatesSkipped: skippedDuplicatesCount,
      failed: failedCount,
      failedCount,
      errors,
      unmappedHeaders
    });
  } catch (error) {
    console.error('Error importing CSV opportunities:', error);
    return res.status(500).json({ message: 'Error processing CSV import', error: error.message });
  }
};

/**
 * GET /opportunities/recommended
 * Generate recommendations tailored to the logged-in student.
 * Uses Random Forest Supervised ML Model as the primary recommendation engine.
 */
exports.getRecommended = async (req, res) => {
  try {
    const student = req.student;
    const mode = (req.query.mode || 'rf').toLowerCase();

    if (!student) {
      return res.status(404).json({ 
        message: 'Student profile not found. Please complete your profile to receive recommendations.' 
      });
    }

    // Fetch all opportunities
    const opportunities = await Opportunity.find({}).lean();

    if (!opportunities || opportunities.length === 0) {
      return res.status(200).json({
        recommendations: [],
        message: 'No opportunities available in the catalog yet.'
      });
    }

    // Exclude expired opportunities AND inactive opportunities from active recommendations
    const now = new Date();
    const activeOpportunities = opportunities.filter(opp => {
      // Inactive/archived filter
      if (opp.isActive === false || opp.status === 'INACTIVE' || opp.status === 'inactive' || opp.status === 'ARCHIVED' || opp.status === 'archived') {
        return false;
      }
      if (!opp.deadline) return true;
      const d = new Date(opp.deadline);
      return isNaN(d.getTime()) || d >= now;
    });

    if (activeOpportunities.length === 0) {
      return res.status(200).json({
        recommendations: [],
        message: 'No active upcoming opportunities available.'
      });
    }

    // Fetch student's prior interaction history
    let pastInteractions = [];
    try {
      pastInteractions = await Interaction.find({ studentId: student._id }).sort({ timestamp: 1 }).lean();
    } catch (itErr) {
      console.warn('[ML Recommendation] Could not load past interactions:', itErr.message);
    }

    // Fetch student's existing applications
    let studentApplications = [];
    try {
      studentApplications = await Application.find({ studentId: student._id }).select('opportunityId status').lean();
    } catch (appErr) {
      console.warn('[Recommendation] Could not load student applications:', appErr.message);
    }
    const appliedStatusMap = new Map();
    studentApplications.forEach(a => {
      if (a.opportunityId) {
        appliedStatusMap.set(a.opportunityId.toString(), a.status || 'Applied');
      }
    });

    // 1. Primary: Supervised Random Forest Classifier Recommendation Engine
    const rfResult = await generateRFRecommendations(student, activeOpportunities, pastInteractions);

    // 2. Fallback / Comparison engines
    const ruleRecommendations = generateRecommendations(student, activeOpportunities);
    const ruleMap = new Map(ruleRecommendations.map(r => [r.opportunityId.toString(), r]));

    const cosineRecommendations = generateMLRecommendations(student, activeOpportunities);
    const cosineMap = new Map(cosineRecommendations.map(c => [c.opportunityId.toString(), c]));

    // 3. Assemble unified recommendation payload respecting mode
    const mergedRecommendations = (rfResult.recommendations || []).map(rfItem => {
      const oppIdStr = rfItem.opportunityId.toString();
      const ruleItem = ruleMap.get(oppIdStr);
      const cosineItem = cosineMap.get(oppIdStr);

      const ruleScore = ruleItem ? ruleItem.score : 50;
      const ruleReasons = ruleItem ? ruleItem.matchReasons : [];
      const cosineScore = cosineItem ? cosineItem.hybridScore : 50;
      const cosineReasons = cosineItem ? cosineItem.matchReasons : [];

      let selectedScore = rfItem.score;
      let activeReasons = rfItem.matchReasons;

      if (mode === 'rule') {
        selectedScore = ruleScore;
        activeReasons = ruleReasons;
      } else if (mode === 'cosine') {
        selectedScore = cosineScore;
        activeReasons = cosineReasons;
      } else {
        selectedScore = rfItem.score;
        activeReasons = rfItem.matchReasons;
      }

      const isApplied = appliedStatusMap.has(oppIdStr);
      const applicationStatus = appliedStatusMap.get(oppIdStr) || null;

      return {
        opportunityId: rfItem.opportunityId,
        opportunity: rfItem.opportunity,
        score: selectedScore,
        probability: rfItem.probability !== undefined ? rfItem.probability : Number((selectedScore / 100).toFixed(4)),
        rfScore: rfItem.score,
        hybridScore: cosineScore,
        mlScore: rfItem.score,
        ruleScore: ruleScore,
        cosineSimilarity: cosineItem ? cosineItem.cosineSimilarity : (rfItem.features?.semanticCosineSim || 0),
        topFeatures: cosineItem ? cosineItem.topFeatures : [],
        features: rfItem.features || {},
        matchReasons: activeReasons,
        ruleReasons: ruleReasons,
        mlReasons: activeReasons,
        eligibilityStatus: rfItem.eligibilityStatus,
        isApplied,
        applicationStatus,
        activeEngine: mode === 'rule' ? 'rule' : (mode === 'cosine' ? 'cosine' : (rfResult.fallback ? 'fallback' : 'random_forest'))
      };
    });

    // Sort according to: 1. Unapplied first, 2. Eligible first, 3. Score desc
    mergedRecommendations.sort((a, b) => {
      if (!a.isApplied && b.isApplied) return -1;
      if (a.isApplied && !b.isApplied) return 1;
      if (a.eligibilityStatus === 'Eligible' && b.eligibilityStatus !== 'Eligible') return -1;
      if (a.eligibilityStatus !== 'Eligible' && b.eligibilityStatus === 'Eligible') return 1;
      return b.score - a.score;
    });

    // Save snapshot in Recommendations collection
    try {
      const recommendationDocs = mergedRecommendations.map(item => ({
        opportunityId: item.opportunityId,
        score: item.score,
        matchReasons: item.matchReasons,
        eligibilityStatus: item.eligibilityStatus
      }));

      await Recommendation.findOneAndUpdate(
        { studentId: student._id },
        {
          studentId: student._id,
          opportunities: recommendationDocs,
          generatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    } catch (saveErr) {
      console.warn('Could not persist recommendation snapshot:', saveErr.message);
    }

    return res.status(200).json({
      activeMode: mode,
      model: rfResult.fallback ? 'fallback_cosine' : 'random_forest',
      modelVersion: rfResult.modelVersion || '1.0.0',
      fallback: Boolean(rfResult.fallback),
      fallbackReason: rfResult.fallbackReason || null,
      modelInfo: {
        type: 'Supervised Machine Learning Recommender',
        primaryAlgorithm: 'RandomForestClassifier (14 Tabular Profile, Academic, Semantic & Behavioral Features)',
        fallbackAlgorithm: 'Content-Based Cosine Similarity + Hard Gate',
        metric: 'Engagement Probability (predict_proba)'
      },
      studentSummary: {
        department: student.department,
        year: student.year,
        cgpa: student.cgpa,
        skillsCount: student.skills?.length || 0,
        interestsCount: student.interests?.length || 0,
        interactionHistoryCount: pastInteractions.length
      },
      recommendations: mergedRecommendations
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return res.status(500).json({ message: 'Error generating recommendations', error: error.message });
  }
};
