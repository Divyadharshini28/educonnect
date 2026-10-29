const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');
const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const SyncLog = require('../models/SyncLog');
const Interaction = require('../models/Interaction');
const Notification = require('../models/Notification');
const Resume = require('../models/Resume');

const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_PATH = process.env.NODE_ENV === 'test'
  ? path.join(DATA_DIR, 'test_db_store.json')
  : path.join(DATA_DIR, 'db_store.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Save all collections to local disk store
 */
async function syncToDisk() {
  try {
    ensureDataDir();
    const students = await Student.find({}).lean();
    const applications = await Application.find({}).lean();
    const opportunities = await Opportunity.find({}).lean();
    const syncLogs = await SyncLog.find({}).sort({ startedAt: -1 }).limit(100).lean();
    const interactions = await Interaction.find({}).lean();
    const notifications = await Notification.find({}).lean();
    const resumes = await Resume.find({}).lean();

    const data = {
      students,
      applications,
      opportunities,
      syncLogs,
      interactions,
      notifications,
      resumes,
      savedAt: new Date().toISOString()
    };

    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Persistence sync notice:', err.message);
  }
}

/**
 * Restore collections from local disk store on database startup
 */
async function restoreFromDisk() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return false;
    }

    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const data = JSON.parse(raw);

    if (Array.isArray(data.opportunities) && data.opportunities.length > 0) {
      for (const opp of data.opportunities) {
        const filter = (opp.source && opp.externalId)
          ? { source: opp.source, externalId: opp.externalId }
          : { _id: opp._id };
        await Opportunity.updateOne(
          filter,
          { $set: opp },
          { upsert: true }
        );
      }
      console.log(`Restored ${data.opportunities.length} opportunities from persistent storage.`);
    }

    if (Array.isArray(data.syncLogs) && data.syncLogs.length > 0) {
      for (const log of data.syncLogs) {
        await SyncLog.updateOne(
          { _id: log._id },
          { $set: log },
          { upsert: true }
        );
      }
      console.log(`Restored ${data.syncLogs.length} sync log entries from persistent storage.`);
    }

    if (Array.isArray(data.students) && data.students.length > 0) {
      for (const std of data.students) {
        await Student.updateOne(
          { _id: std._id },
          { $set: std },
          { upsert: true }
        );
      }
      console.log(`Restored ${data.students.length} student profiles from persistent storage.`);
    }

    if (Array.isArray(data.applications) && data.applications.length > 0) {
      for (const app of data.applications) {
        await Application.updateOne(
          { _id: app._id },
          { $set: app },
          { upsert: true }
        );
      }
      console.log(`Restored ${data.applications.length} submitted applications from persistent storage.`);
    }

    if (Array.isArray(data.interactions) && data.interactions.length > 0) {
      for (const it of data.interactions) {
        await Interaction.updateOne(
          { _id: it._id },
          { $set: it },
          { upsert: true }
        );
      }
      console.log(`Restored ${data.interactions.length} student interactions from persistent storage.`);
    }

    if (Array.isArray(data.notifications) && data.notifications.length > 0) {
      for (const notif of data.notifications) {
        await Notification.updateOne(
          { _id: notif._id },
          { $set: notif },
          { upsert: true }
        );
      }
      console.log(`Restored ${data.notifications.length} notifications from persistent storage.`);
    }

    if (Array.isArray(data.resumes) && data.resumes.length > 0) {
      for (const resDoc of data.resumes) {
        await Resume.updateOne(
          { _id: resDoc._id },
          { $set: resDoc },
          { upsert: true }
        );
      }
      console.log(`Restored ${data.resumes.length} resume intelligence records from persistent storage.`);
    }

    return true;
  } catch (err) {
    console.warn('Persistence restore notice:', err.message);
    return false;
  }
}

module.exports = {
  syncToDisk,
  restoreFromDisk
};
