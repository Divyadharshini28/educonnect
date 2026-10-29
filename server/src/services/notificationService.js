const Notification = require('../models/Notification');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Student = require('../models/Student');
const { syncToDisk } = require('../config/dbPersistence');

/**
 * Generates deadline and status reminders for a student.
 * 
 * Reminders criteria:
 * - Deadline today (0 days)
 * - Deadline approaching (1-7 days)
 * - Excludes expired opportunities.
 * - Deduplicates via dedupKey so students never receive duplicate notifications.
 * 
 * @param {Object} student - Authenticated student document
 * @returns {Promise<Array>} List of newly generated notifications
 */
async function syncStudentReminders(student) {
  if (!student || !student._id) return [];

  const createdNotifications = [];
  const now = new Date();
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const maxUTC = nowUTC + 7 * 24 * 60 * 60 * 1000;

  try {
    // 1. Gather opportunities relevant to student: Bookmarks + Applications + High recommendations
    const populatedStudent = await Student.findById(student._id).populate('bookmarks').lean();
    const bookmarkedOpps = populatedStudent?.bookmarks || [];

    const applications = await Application.find({ studentId: student._id }).populate('opportunityId').lean();
    const appliedOpps = applications.map(a => a.opportunityId).filter(Boolean);

    // Merge unique opportunities
    const oppMap = new Map();
    [...bookmarkedOpps, ...appliedOpps].forEach(opp => {
      if (opp && opp._id) {
        oppMap.set(opp._id.toString(), opp);
      }
    });

    const relevantOpps = Array.from(oppMap.values());

    for (const opp of relevantOpps) {
      if (!opp.deadline) continue;
      const d = new Date(opp.deadline);
      if (isNaN(d.getTime())) continue;

      const oppUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      // Expired: ignore
      if (oppUTC < nowUTC) continue;
      // Beyond 7 days: ignore for now
      if (oppUTC > maxUTC) continue;

      const diffDays = Math.round((oppUTC - nowUTC) / (1000 * 60 * 60 * 24));
      const deadlineDateStr = d.toISOString().split('T')[0];

      let type;
      let title;
      let message;
      let dedupKey;

      if (diffDays === 0) {
        type = 'DEADLINE_TODAY';
        title = `Deadline Today: ${opp.title}`;
        message = `The deadline for "${opp.title}" closes today. Don't miss your chance to apply!`;
        dedupKey = `${student._id}_today_${opp._id}_${deadlineDateStr}`;
      } else if (diffDays === 1) {
        type = 'DEADLINE_APPROACHING';
        title = `Closes Tomorrow: ${opp.title}`;
        message = `"${opp.title}" closes tomorrow. Ensure your application materials are prepared.`;
        dedupKey = `${student._id}_soon_${opp._id}_${deadlineDateStr}`;
      } else {
        type = 'DEADLINE_APPROACHING';
        title = `Deadline in ${diffDays} Days: ${opp.title}`;
        message = `"${opp.title}" closes in ${diffDays} days (${d.toLocaleDateString('en-US')}). Check requirements and apply.`;
        dedupKey = `${student._id}_soon_${opp._id}_${deadlineDateStr}`;
      }

      // Check if notification with this dedupKey already exists
      const existing = await Notification.findOne({
        studentId: student._id,
        dedupKey
      });

      if (!existing) {
        const notif = new Notification({
          studentId: student._id,
          title,
          message,
          type,
          opportunityId: opp._id,
          link: `/opportunity/${opp._id}`,
          isRead: false,
          dedupKey,
          createdAt: new Date()
        });
        await notif.save();
        createdNotifications.push(notif);
      }
    }

    if (createdNotifications.length > 0) {
      await syncToDisk();
    }
  } catch (err) {
    console.warn('Reminder sync notice:', err.message);
  }

  return createdNotifications;
}

/**
 * Creates an in-app notification.
 */
async function createNotification({
  studentId,
  title,
  message,
  type = 'SYSTEM',
  opportunityId = null,
  applicationId = null,
  link = '',
  dedupKey = null
}) {
  try {
    if (dedupKey) {
      const existing = await Notification.findOne({ studentId, dedupKey });
      if (existing) return existing;
    }

    const notif = new Notification({
      studentId,
      title,
      message,
      type,
      opportunityId,
      applicationId,
      link,
      dedupKey,
      isRead: false,
      createdAt: new Date()
    });

    await notif.save();
    await syncToDisk();
    return notif;
  } catch (err) {
    console.warn('Could not create notification:', err.message);
    return null;
  }
}

/**
 * Fetches notifications for a student.
 */
async function getStudentNotifications(studentId) {
  return Notification.find({ studentId })
    .sort({ createdAt: -1 })
    .populate('opportunityId', 'title organization type deadline')
    .lean();
}

/**
 * Marks single notification as read.
 */
async function markNotificationAsRead(studentId, notificationId) {
  const notif = await Notification.findOneAndUpdate(
    { _id: notificationId, studentId },
    { isRead: true },
    { new: true }
  );
  if (notif) await syncToDisk();
  return notif;
}

/**
 * Marks all notifications for a student as read.
 */
async function markAllNotificationsAsRead(studentId) {
  const result = await Notification.updateMany(
    { studentId, isRead: false },
    { isRead: true }
  );
  await syncToDisk();
  return result;
}

module.exports = {
  syncStudentReminders,
  createNotification,
  getStudentNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
};
