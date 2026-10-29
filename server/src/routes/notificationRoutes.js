const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/authMiddleware');

// All notification routes require authentication
router.use(requireAuth);

// GET /notifications - Get notifications and unread count
router.get('/', notificationController.getNotifications);

// POST /notifications/sync - Manually trigger sync
router.post('/sync', notificationController.syncReminders);

// PATCH /notifications/read-all - Mark all as read
router.patch('/read-all', notificationController.markAllAsRead);

// PATCH /notifications/:id/read - Mark single as read
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
