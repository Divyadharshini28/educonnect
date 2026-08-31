const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');
const { requireAuth } = require('../middleware/authMiddleware');

// POST /applications – Submit application
router.post('/', requireAuth, applicationController.submitApplication);

// GET /applications/:id – Fetch application status
router.get('/:id', requireAuth, applicationController.getApplicationById);

// PUT /applications/:id – Update status (admin / evaluator action)
router.put('/:id', requireAuth, applicationController.updateApplicationStatus);

module.exports = router;
