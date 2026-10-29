const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const { connectDB } = require('./config/db');
const { initFirebase } = require('./config/firebase');
const { restoreFromDisk } = require('./config/dbPersistence');
const Opportunity = require('./models/Opportunity');
const { seedDatabase } = require('./seed/seedData');

const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const opportunityRoutes = require('./routes/opportunityRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const syncRoutes = require('./routes/syncRoutes');
const interactionRoutes = require('./routes/interactionRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const { startSyncScheduler } = require('./services/syncScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

initFirebase();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'EduConnect - Unified Student Opportunity Platform',
    timestamp: new Date()
  });
});

app.use('/auth', authRoutes);
app.use('/student/resume', resumeRoutes);
app.use('/api/student/resume', resumeRoutes);
app.use('/student', studentRoutes);
app.use('/opportunities', opportunityRoutes);
app.use('/applications', applicationRoutes);
app.use('/api/sync', syncRoutes);
app.use('/sync', syncRoutes);
app.use('/api/interactions', interactionRoutes);
app.use('/interactions', interactionRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/recommendations', recommendationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/notifications', notificationRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

async function startServer() {
  try {
    await connectDB();

    // Restore persistent registered students, catalog opportunities, and applications from disk store first
    await restoreFromDisk();

    // Check if initial opportunities need seeding
    const oppCount = await Opportunity.countDocuments();
    if (oppCount === 0) {
      console.log('No opportunities found in database. Initializing catalog...');
      await seedDatabase();
    }

    // Start automated opportunity synchronization scheduler if enabled and not in test environment
    startSyncScheduler();

    const server = app.listen(PORT, () => {
      console.log(`EduConnect API Server running on port ${PORT}`);
      console.log(`Healthcheck available at: http://localhost:${PORT}/api/health`);
    });

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
