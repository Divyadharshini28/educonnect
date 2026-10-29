const express = require('express');
const router = express.Router();
const interactionController = require('../controllers/interactionController');
const { requireAuth } = require('../middleware/authMiddleware');

// POST /api/interactions – Record student interaction event
router.post('/', requireAuth, interactionController.recordInteraction);

// GET /api/interactions – Query student interaction history (with pagination & filters)
router.get('/', requireAuth, interactionController.getStudentInteractions);

// GET /api/interactions/summary – Aggregated student behavioral interaction metrics
router.get('/summary', requireAuth, interactionController.getInteractionSummary);

module.exports = router;
