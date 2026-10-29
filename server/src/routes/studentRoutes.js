const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const resumeRoutes = require('./resumeRoutes');
const { requireAuth } = require('../middleware/authMiddleware');

// Mount Resume Intelligence sub-router
router.use('/resume', resumeRoutes);

// POST /student/profile (create/update profile)
router.post('/profile', requireAuth, studentController.createOrUpdateProfile);

// GET /student/profile (fetch profile)
router.get('/profile', requireAuth, studentController.getProfile);

// GET /student/applications (fetch submission history)
router.get('/applications', requireAuth, studentController.getApplications);

// GET /student/bookmarks (fetch bookmarked opportunities)
router.get('/bookmarks', requireAuth, studentController.getBookmarks);

// POST /student/bookmarks/:opportunityId or POST /student/bookmarks
router.post('/bookmarks/:opportunityId', requireAuth, studentController.toggleBookmark);
router.post('/bookmarks', requireAuth, studentController.toggleBookmark);

// DELETE /student/bookmarks/:opportunityId
router.delete('/bookmarks/:opportunityId', requireAuth, studentController.removeBookmark);

// GET /student/analytics & /student/insights (fetch student analytics and opportunity insights)
router.get('/analytics', requireAuth, studentController.getStudentAnalytics);
router.get('/insights', requireAuth, studentController.getStudentAnalytics);

module.exports = router;
