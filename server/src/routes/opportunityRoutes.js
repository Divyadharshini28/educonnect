const express = require('express');
const router = express.Router();
const opportunityController = require('../controllers/opportunityController');
const { requireAuth } = require('../middleware/authMiddleware');

// GET /opportunities/recommended – Get recommendations for logged-in student
router.get('/recommended', requireAuth, opportunityController.getRecommended);

// GET /opportunities – Fetch all (with filters)
router.get('/', opportunityController.getOpportunities);

// GET /opportunities/:id – Fetch single
router.get('/:id', opportunityController.getOpportunityById);

module.exports = router;
