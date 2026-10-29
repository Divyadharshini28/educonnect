const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const {
  handleMulterUpload,
  uploadResume,
  getResumeStatus,
  downloadResume,
  confirmSkills,
  retryParse,
  adminOverrideCooldown
} = require('../controllers/resumeController');

// All routes require authentication
router.use(requireAuth);

// Get current active resume metadata, intelligence status, and cooldown
router.get('/', getResumeStatus);
router.get('/status', getResumeStatus);

// Upload new or replacement resume
router.post('/upload', handleMulterUpload, uploadResume);

// Download resume from GridFS (with student ownership verification)
router.get('/download', downloadResume);
router.get('/download/:resumeId', downloadResume);

// Confirm extracted skills and update student profile
router.post('/confirm-skills', confirmSkills);

// Retry parsing existing resume in GridFS without re-uploading
router.post('/retry-parse', retryParse);

// Admin-only cooldown override
router.post('/admin/override-cooldown', requireAdmin, adminOverrideCooldown);

module.exports = router;
