const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

// POST /auth/register (Profile synchronization for authenticated Firebase user)
router.post('/register', requireAuth, authController.register);

// POST /auth/logout
router.post('/logout', authController.logout);

module.exports = router;
