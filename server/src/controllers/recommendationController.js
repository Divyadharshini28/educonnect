const Opportunity = require('../models/Opportunity');
const Student = require('../models/Student');
const Interaction = require('../models/Interaction');
const Recommendation = require('../models/Recommendation');
const {
  generateRFRecommendations,
  getMLStatus,
  compareRecommenders
} = require('../services/rfRecommenderService');

/**
 * GET /api/recommendations/ml-status
 * Returns ML model operational availability, evaluation metrics, and feature schemas.
 */
exports.getMLStatus = async (req, res) => {
  try {
    const status = getMLStatus();
    return res.status(200).json(status);
  } catch (error) {
    console.error('Error retrieving ML status:', error);
    return res.status(500).json({
      available: false,
      status: 'error',
      message: 'Error retrieving ML model status',
      error: error.message
    });
  }
};

/**
 * GET /api/recommendations/compare
 * Compares output of Existing Recommender vs Random Forest Recommender for the authenticated student.
 */
exports.compareRecommendations = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const opportunities = await Opportunity.find({}).lean();
    const pastInteractions = await Interaction.find({ studentId: student._id }).lean();

    const comparisonResult = await compareRecommenders(student, opportunities, pastInteractions);
    return res.status(200).json(comparisonResult);
  } catch (error) {
    console.error('Error comparing recommenders:', error);
    return res.status(500).json({
      message: 'Error generating recommendation comparison',
      error: error.message
    });
  }
};

/**
 * GET /api/recommendations
 * Direct recommendation endpoint utilizing Random Forest with automated fallback.
 */
exports.getRecommendations = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const opportunities = await Opportunity.find({}).lean();
    const pastInteractions = await Interaction.find({ studentId: student._id }).lean();

    const result = await generateRFRecommendations(student, opportunities, pastInteractions);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return res.status(500).json({
      message: 'Error fetching recommendations',
      error: error.message
    });
  }
};
