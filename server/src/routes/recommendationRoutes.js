const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const { requireAuth } = require('../middleware/authMiddleware');

// GET /api/recommendations/ml-status - Public/authenticated status of Random Forest model
router.get('/ml-status', recommendationController.getMLStatus);

// GET /api/recommendations/compare - Protected model comparison endpoint
router.get('/compare', requireAuth, recommendationController.compareRecommendations);

// GET /api/recommendations - Protected direct recommendation endpoint
router.get('/', requireAuth, recommendationController.getRecommendations);

module.exports = router;
