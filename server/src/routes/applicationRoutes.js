const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// POST /applications – Submit application
router.post('/', requireAuth, applicationController.submitApplication);

// GET /applications/:id – Fetch application status
router.get('/:id', requireAuth, applicationController.getApplicationById);

// PUT /applications/:id – Admin: update status (admin / evaluator action)
router.put('/:id', requireAuth, requireAdmin, applicationController.updateApplicationStatus);

// PATCH /applications/:id/student-update – Student self-reported status update for external applications
router.patch('/:id/student-update', requireAuth, applicationController.studentUpdateApplicationStatus);

module.exports = router;
