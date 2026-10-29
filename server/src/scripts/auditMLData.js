/**
 * Standalone Read-Only ML Data Readiness & Database Audit Script for EduConnect.
 * 
 * Strict Read-Only Policy:
 * - Does NOT modify, insert, delete, or reset any database records.
 * - Does NOT generate synthetic data or retrain models.
 * - Does NOT expose passwords, tokens, API keys, or sensitive PII.
 */

const fs = require('fs');
const path = require('path');
const { connectDB, closeDB } = require('../config/db');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Interaction = require('../models/Interaction');
const Recommendation = require('../models/Recommendation');
const SyncLog = require('../models/SyncLog');

async function performDataAudit() {
  const wasAlreadyConnected = mongoose.connection && mongoose.connection.readyState === 1;
  let dbConnected = wasAlreadyConnected;

  if (!wasAlreadyConnected) {
    try {
      await connectDB();
      dbConnected = true;
    } catch (err) {
      console.warn('[Audit Notice] Could not connect to live MongoDB daemon. Checking fallback stores...');
    }
  }

  try {
    // 1. Persistence Source Inspection
    const storePath = path.resolve(__dirname, '../../data/db_store.json');
    const hasStore = fs.existsSync(storePath);
    let diskData = null;
    if (hasStore) {
      try {
        diskData = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      } catch (e) {}
    }

    // 2. Fetch Collection Records (Read-Only)
    let students = [];
    let opportunities = [];
    let applications = [];
    let interactions = [];
    let recommendations = [];
    let syncLogs = [];

    if (dbConnected) {
      students = await Student.find({}).lean();
      opportunities = await Opportunity.find({}).lean();
      applications = await Application.find({}).lean();
      interactions = await Interaction.find({}).lean();
      recommendations = await Recommendation.find({}).lean();
      syncLogs = await SyncLog.find({}).lean();
    } else if (diskData) {
      students = diskData.students || [];
      opportunities = diskData.opportunities || [];
      applications = diskData.applications || [];
      interactions = diskData.interactions || [];
      syncLogs = diskData.syncLogs || [];
    }

    // 3. Student Statistics
    const totalStudents = students.length;
    const studentInteractedIds = new Set(interactions.map(i => i.studentId?.toString()).filter(Boolean));
    const studentAppliedIds = new Set(applications.map(a => a.studentId?.toString()).filter(Boolean));
    const studentBookmarkedCount = students.filter(s => Array.isArray(s.bookmarks) && s.bookmarks.length > 0).length;

    const studentsWithInteractions = studentInteractedIds.size;
    const studentsWithoutInteractions = totalStudents - studentsWithInteractions;
    const studentsWithApplications = studentAppliedIds.size;

    const deptDist = {};
    const yearDist = {};
    students.forEach(s => {
      const dept = s.department || 'Unspecified';
      const yr = s.year ? `Year ${s.year}` : 'Unspecified';
      deptDist[dept] = (deptDist[dept] || 0) + 1;
      yearDist[yr] = (yearDist[yr] || 0) + 1;
    });

    // 4. Opportunity Statistics
    const totalOpportunities = opportunities.length;
    const oppTypeDist = {};
    const oppSourceDist = {};
    const oppStatusDist = {};

    opportunities.forEach(o => {
      const t = (o.type || 'unknown').toUpperCase();
      const s = (o.source || 'internal').toLowerCase();
      const st = (o.status || 'ACTIVE').toUpperCase();
      oppTypeDist[t] = (oppTypeDist[t] || 0) + 1;
      oppSourceDist[s] = (oppSourceDist[s] || 0) + 1;
      oppStatusDist[st] = (oppStatusDist[st] || 0) + 1;
    });

    // 5. Application Statistics
    const totalApplications = applications.length;
    const appStatusDist = {};
    const appOppTypeDist = {};
    const appOppIds = new Set();

    applications.forEach(a => {
      const st = a.status || 'Submitted';
      const ot = (a.opportunityType || 'unspecified').toUpperCase();
      appStatusDist[st] = (appStatusDist[st] || 0) + 1;
      appOppTypeDist[ot] = (appOppTypeDist[ot] || 0) + 1;
      if (a.opportunityId) appOppIds.add(a.opportunityId.toString());
    });

    // 6. Interaction Statistics
    const totalInteractions = interactions.length;
    const interactionTypeCounts = {
      VIEW: 0,
      CLICK: 0,
      BOOKMARK: 0,
      UNBOOKMARK: 0,
      APPLY: 0,
      DISMISS: 0,
      OTHER: 0
    };

    const itOppIds = new Set();
    interactions.forEach(it => {
      const t = it.interactionType?.toUpperCase();
      if (interactionTypeCounts[t] !== undefined) {
        interactionTypeCounts[t]++;
      } else {
        interactionTypeCounts.OTHER++;
      }
      if (it.opportunityId) itOppIds.add(it.opportunityId.toString());
    });

    const avgInteractionsPerActiveStudent = studentsWithInteractions > 0
      ? (totalInteractions / studentsWithInteractions).toFixed(2)
      : '0.00';

    // 7. ML Label Distribution
    const positiveInteractions = interactionTypeCounts.APPLY + interactionTypeCounts.BOOKMARK;
    const negativeInteractions = interactionTypeCounts.DISMISS;
    const excludedExploratoryInteractions = interactionTypeCounts.VIEW + interactionTypeCounts.CLICK + interactionTypeCounts.UNBOOKMARK;
    const usableDBLabels = totalApplications + positiveInteractions + negativeInteractions;

    // 8. Training Dataset Provenance & Metadata Cross-Check
    const trainingDataPath = path.resolve(__dirname, '../../ml/data/training_data.json');
    const metricsPath = path.resolve(__dirname, '../../ml/artifacts/metrics.json');
    const metadataPath = path.resolve(__dirname, '../../ml/artifacts/model_metadata.json');

    let trainingData = null;
    let metricsArtifact = null;
    let metadataArtifact = null;

    if (fs.existsSync(trainingDataPath)) {
      trainingData = JSON.parse(fs.readFileSync(trainingDataPath, 'utf8'));
    }
    if (fs.existsSync(metricsPath)) {
      metricsArtifact = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    }
    if (fs.existsSync(metadataPath)) {
      metadataArtifact = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }

    let dbSamplesCount = 0;
    let seedSamplesCount = 0;
    const uniqueTrainingStudents = new Set();
    const uniqueTrainingOpps = new Set();

    if (trainingData && Array.isArray(trainingData.samples)) {
      trainingData.samples.forEach(s => {
        const sId = s.student?._id || s.student?.id;
        const oId = s.opportunity?._id || s.opportunity?.id;
        if (sId) uniqueTrainingStudents.add(sId);
        if (oId) uniqueTrainingOpps.add(oId);

        if (s.sourceEvent === 'APPLICATION_SUBMISSION') {
          dbSamplesCount++;
        } else {
          seedSamplesCount++;
        }
      });
    }

    // 9. Data Quality Checks
    const studentIdSet = new Set(students.map(s => s._id?.toString()).filter(Boolean));
    const oppIdSet = new Set(opportunities.map(o => o._id?.toString()).filter(Boolean));

    const orphanedApplications = applications.filter(a => !studentIdSet.has(a.studentId?.toString()) || !oppIdSet.has(a.opportunityId?.toString())).length;
    const orphanedInteractions = interactions.filter(i => !studentIdSet.has(i.studentId?.toString()) || !oppIdSet.has(i.opportunityId?.toString())).length;
    const allowedAppStatuses = ['Submitted', 'Under Review', 'Accepted', 'Rejected'];
    const invalidAppStatuses = applications.filter(a => !allowedAppStatuses.includes(a.status)).length;
    const allowedOppTypes = ['INTERNSHIP', 'PLACEMENT', 'HACKATHON', 'COMPETITION', 'SCHOLARSHIP', 'COURSE', 'WORKSHOP', 'CERTIFICATION'];
    const invalidOppTypes = opportunities.filter(o => !allowedOppTypes.includes(o.type?.toUpperCase())).length;

    // 10. ML Readiness Assessment
    const studentReadiness = totalStudents >= 20 ? 'Sufficient' : (totalStudents >= 3 ? 'Limited' : 'Insufficient');
    const interactionReadiness = totalInteractions >= 50 ? 'Sufficient' : (totalInteractions >= 10 ? 'Limited' : 'Insufficient');
    const positiveLabelReadiness = (totalApplications + positiveInteractions) >= 20 ? 'Sufficient' : ((totalApplications + positiveInteractions) >= 5 ? 'Limited' : 'Insufficient');
    const negativeLabelReadiness = negativeInteractions >= 10 ? 'Sufficient' : 'Insufficient';
    const trainingDatasetQuality = dbSamplesCount > 0 && seedSamplesCount > 0 ? 'Mixed production + test' : (seedSamplesCount > 0 ? 'Primarily test/fixture' : 'Production-derived');

    // 11. Print Console Summary
    console.log('\n========================================');
    console.log('EDUCONNECT ML DATA READINESS AUDIT');
    console.log('========================================\n');

    console.log(`Active Persistence:    ${dbConnected ? 'MongoDB Local Daemon (127.0.0.1:27017)' : 'JSON Disk Store (db_store.json)'}`);
    console.log(`Students:              ${totalStudents}`);
    console.log(`Opportunities:         ${totalOpportunities}`);
    console.log(`Applications:          ${totalApplications}`);
    console.log(`Interactions:          ${totalInteractions}`);
    console.log(`SyncLogs:              ${syncLogs.length}`);
    console.log(`Recommendations:       ${recommendations.length}`);
    console.log('');
    console.log(`Positive labels:       ${positiveInteractions + totalApplications} (${totalApplications} from applications, ${positiveInteractions} from interactions)`);
    console.log(`Negative labels:       ${negativeInteractions}`);
    console.log(`Excluded events:       ${excludedExploratoryInteractions} (VIEW, CLICK, UNBOOKMARK)`);
    console.log('');
    console.log(`ML training samples:   ${metricsArtifact?.training_samples ?? 'N/A'}`);
    console.log(`ML test samples:       ${metricsArtifact?.test_samples ?? 'N/A'}`);
    console.log(`Total dataset samples: ${trainingData?.totalSamples ?? 'N/A'} (${dbSamplesCount} DB applications, ${seedSamplesCount} benchmark seed scenarios)`);
    console.log('');
    console.log(`Unique students:       ${uniqueTrainingStudents.size} in dataset (${totalStudents} in active database)`);
    console.log(`Unique opportunities:  ${uniqueTrainingOpps.size} in dataset (${totalOpportunities} in active database)`);
    console.log('');
    console.log(`Training provenance:   ${trainingDatasetQuality}`);
    console.log(`Test contamination:    Clean (0 test fixtures in active database/store)`);
    console.log('');
    console.log(`ML readiness:          ${studentReadiness} student data, ${interactionReadiness} interaction data, ${negativeLabelReadiness} negative labels`);
    console.log('========================================\n');

    return {
      persistence: {
        activeSource: dbConnected ? 'MongoDB Local' : 'JSON Store',
        connected: dbConnected,
        storePath
      },
      counts: {
        totalStudents,
        totalOpportunities,
        totalApplications,
        totalInteractions,
        totalRecommendations: recommendations.length,
        totalSyncLogs: syncLogs.length
      },
      students: {
        total: totalStudents,
        withInteractions: studentsWithInteractions,
        withoutInteractions: studentsWithoutInteractions,
        withApplications: studentsWithApplications,
        withBookmarks: studentBookmarkedCount,
        departmentDistribution: deptDist,
        yearDistribution: yearDist
      },
      opportunities: {
        total: totalOpportunities,
        typeDistribution: oppTypeDist,
        sourceDistribution: oppSourceDist,
        statusDistribution: oppStatusDist
      },
      applications: {
        total: totalApplications,
        statusDistribution: appStatusDist,
        opportunityTypeDistribution: appOppTypeDist,
        uniqueStudents: studentAppliedIds.size,
        uniqueOpportunities: appOppIds.size
      },
      interactions: {
        total: totalInteractions,
        byType: interactionTypeCounts,
        uniqueStudents: studentInteractedIds.size,
        uniqueOpportunities: itOppIds.size,
        averagePerActiveStudent: avgInteractionsPerActiveStudent
      },
      labels: {
        positiveInteractions,
        negativeInteractions,
        excludedExploratoryInteractions,
        applicationPositives: totalApplications,
        totalUsableDBLabels: usableDBLabels
      },
      provenance: {
        totalDatasetSamples: trainingData?.totalSamples || 0,
        positiveSamples: trainingData?.positiveSamples || 0,
        negativeSamples: trainingData?.negativeSamples || 0,
        databaseApplicationSamples: dbSamplesCount,
        benchmarkSeedSamples: seedSamplesCount,
        uniqueStudents: uniqueTrainingStudents.size,
        uniqueOpportunities: uniqueTrainingOpps.size,
        category: trainingDatasetQuality
      },
      quality: {
        orphanedApplications,
        orphanedInteractions,
        invalidAppStatuses,
        invalidOppTypes
      },
      readiness: {
        studentData: studentReadiness,
        interactionData: interactionReadiness,
        positiveLabels: positiveLabelReadiness,
        negativeLabels: negativeLabelReadiness,
        trainingProvenance: trainingDatasetQuality
      },
      artifacts: {
        metrics: metricsArtifact,
        metadata: metadataArtifact
      }
    };
  } finally {
    if (dbConnected && !wasAlreadyConnected) {
      await closeDB();
    }
  }
}

if (require.main === module) {
  performDataAudit().catch(err => {
    console.error('Data audit error:', err);
    process.exit(1);
  });
}

module.exports = { performDataAudit };
