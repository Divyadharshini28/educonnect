const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { requireAuth } = require('../middleware/authMiddleware');

// POST /student/profile (create/update profile)
router.post('/profile', requireAuth, studentController.createOrUpdateProfile);

// GET /student/profile (fetch profile)
router.get('/profile', requireAuth, studentController.getProfile);

// GET /student/applications (fetch submission history)
router.get('/applications', requireAuth, studentController.getApplications);

module.exports = router;
