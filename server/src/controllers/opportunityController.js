const Opportunity = require('../models/Opportunity');
const Recommendation = require('../models/Recommendation');
const { generateRecommendations } = require('../services/recommendationEngine');
const { generateMLRecommendations } = require('../services/mlRecommendationEngine');

/**
 * GET /opportunities
 * Fetch all opportunities with optional query filters (type, department, search, minCGPA)
 */
exports.getOpportunities = async (req, res) => {
  try {
    const { type, department, search, minCGPA } = req.query;
    const query = {};

    if (type && type !== 'all') {
      query.type = type.toLowerCase();
    }

    if (department && department !== 'all') {
      query['eligibility.department'] = { $in: [department, 'All', 'all', 'Any', 'any'] };
    }

    if (minCGPA) {
      query['eligibility.minCGPA'] = { $lte: Number(minCGPA) };
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { organization: searchRegex },
        { 'eligibility.skills': searchRegex },
        { tags: searchRegex }
      ];
    }

    const opportunities = await Opportunity.find(query).sort({ postedDate: -1, deadline: 1 });

    return res.status(200).json(opportunities);
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return res.status(500).json({ message: 'Error fetching opportunities', error: error.message });
  }
};

/**
 * GET /opportunities/:id
 * Fetch single opportunity details
 */
exports.getOpportunityById = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id);
    if (!opportunity) {
      return res.status(404).json({ message: 'Opportunity not found' });
    }
    return res.status(200).json(opportunity);
  } catch (error) {
    console.error('Error fetching opportunity by ID:', error);
    return res.status(500).json({ message: 'Error fetching opportunity', error: error.message });
  }
};

/**
 * GET /opportunities/recommended
 * Generate recommendations tailored to the logged-in student.
 * Supports query param: ?mode=hybrid | ?mode=ml | ?mode=rule
 */
exports.getRecommended = async (req, res) => {
  try {
    const student = req.student;
    const mode = (req.query.mode || 'hybrid').toLowerCase();

    if (!student) {
      return res.status(404).json({ 
        message: 'Student profile not found. Please complete your profile to receive recommendations.' 
      });
    }

    // Fetch all active opportunities
    const opportunities = await Opportunity.find({}).lean();

    if (!opportunities || opportunities.length === 0) {
      return res.status(200).json({
        recommendations: [],
        message: 'No opportunities available in the catalog yet.'
      });
    }

    // 1. Run Rule-Based Engine
    const ruleRecommendations = generateRecommendations(student, opportunities);
    const ruleMap = new Map(ruleRecommendations.map(r => [r.opportunityId.toString(), r]));

    // 2. Run Content-Based ML Vector Space Engine
    const mlRecommendations = generateMLRecommendations(student, opportunities);

    // 3. Assemble unified multi-model recommendation payload
    const mergedRecommendations = mlRecommendations.map(mlItem => {
      const ruleItem = ruleMap.get(mlItem.opportunityId.toString());
      const ruleScore = ruleItem ? ruleItem.score : 50;
      const ruleReasons = ruleItem ? ruleItem.matchReasons : [];

      let selectedScore = mlItem.hybridScore;
      let activeReasons = mlItem.matchReasons;

      if (mode === 'rule') {
        selectedScore = ruleScore;
        activeReasons = ruleReasons;
      } else if (mode === 'ml') {
        selectedScore = mlItem.mlScore;
        activeReasons = mlItem.matchReasons;
      }

      return {
        opportunityId: mlItem.opportunityId,
        opportunity: mlItem.opportunity,
        score: selectedScore,
        hybridScore: mlItem.hybridScore,
        mlScore: mlItem.mlScore,
        ruleScore: ruleScore,
        cosineSimilarity: mlItem.cosineSimilarity,
        topFeatures: mlItem.topFeatures,
        matchReasons: activeReasons,
        ruleReasons: ruleReasons,
        mlReasons: mlItem.matchReasons,
        eligibilityStatus: mlItem.eligibilityStatus,
        activeEngine: mode
      };
    });

    // Sort according to active mode score
    mergedRecommendations.sort((a, b) => {
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
      modelInfo: {
        type: 'Hybrid Recommender System',
        mlAlgorithm: 'TF-IDF Vector Space Model with Cosine Similarity',
        ruleAlgorithm: 'Hard Eligibility Filters + Soft Category Weights',
        metric: 'Cosine Distance in L2 Normalized Space'
      },
      studentSummary: {
        department: student.department,
        year: student.year,
        cgpa: student.cgpa,
        skillsCount: student.skills?.length || 0,
        interestsCount: student.interests?.length || 0
      },
      recommendations: mergedRecommendations
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return res.status(500).json({ message: 'Error generating recommendations', error: error.message });
  }
};
