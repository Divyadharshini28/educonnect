const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');
const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');

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

    const data = {
      students,
      applications,
      opportunities,
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
        await Opportunity.updateOne(
          { _id: opp._id },
          { $set: opp },
          { upsert: true }
        );
      }
      console.log(`Restored ${data.opportunities.length} opportunities from persistent storage.`);
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
