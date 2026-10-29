const {
  syncStudentReminders,
  getStudentNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} = require('../services/notificationService');

/**
 * GET /notifications
 * Fetches all notifications for the authenticated student, syncing deadline reminders first.
 */
exports.getNotifications = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Auto-sync reminders for student's bookmarked & applied opportunities
    await syncStudentReminders(student);

    const notifications = await getStudentNotifications(student._id);
    const unreadCount = notifications.filter(n => !n.isRead).length;

    return res.status(200).json({
      notifications,
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};

/**
 * PATCH /notifications/:id/read
 * Mark a single notification as read.
 */
exports.markAsRead = async (req, res) => {
  try {
    const student = req.student;
    const { id } = req.params;

    if (!student) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const updated = await markNotificationAsRead(student._id, id);
    if (!updated) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.status(200).json({
      success: true,
      notification: updated
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ message: 'Error updating notification', error: error.message });
  }
};

/**
 * PATCH /notifications/read-all
 * Mark all notifications as read for the authenticated student.
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    await markAllNotificationsAsRead(student._id);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({ message: 'Error updating notifications', error: error.message });
  }
};

/**
 * POST /notifications/sync
 * Manually trigger deadline reminders sync.
 */
exports.syncReminders = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const created = await syncStudentReminders(student);

    return res.status(200).json({
      success: true,
      syncedCount: created.length
    });
  } catch (error) {
    console.error('Error syncing reminders:', error);
    return res.status(500).json({ message: 'Error syncing reminders', error: error.message });
  }
};
