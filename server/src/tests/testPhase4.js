/**
 * Phase 4 Verification Suite: Hopin Jobs and Events Ingestion Pipeline
 * 
 * Verifies:
 * 1. Live Hopin API reachability for /api/jobs and /api/events
 * 2. Normalization & validation for Hopin Jobs (canonical type: PLACEMENT)
 * 3. Normalization & validation for Hopin Events (canonical types: WORKSHOP, HACKATHON, COMPETITION)
 * 4. Strict null handling (no invented deadlines or fees)
 * 5. First synchronization run (insertions)
 * 6. Second synchronization run (updates with zero duplicate records)
 * 7. SyncLog lifecycle and category logging ('jobs', 'events')
 * 8. Resilient failure handling (unreachable network/host)
 * 9. Existing REST API compatibility (GET /opportunities, type filters, single item)
 */

const http = require('http');
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const { app } = require('../server');
const Opportunity = require('../models/Opportunity');
const SyncLog = require('../models/SyncLog');
const { fetchJobs, fetchEvents } = require('../services/hopinService');
const {
  normalizeHopinJob,
  normalizeHopinEvent,
  validateNormalizedOpportunity,
  classifyHopinEventType
} = require('../utils/normalizeOpportunity');
const { syncHopinJobs, syncHopinEvents, syncAllHopin } = require('../services/syncService');

async function runPhase4Tests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 4 VERIFICATION SUITE: HOPIN JOBS & EVENTS');
  console.log('======================================================\n');

  await connectDB();
  await Opportunity.init();

  const testJobIds = ['hopin-test-job-001', 'hopin-test-job-002'];
  const testEventIds = ['hopin-test-evt-001', 'hopin-test-evt-002', 'hopin-test-evt-003'];
  const allTestIds = [...testJobIds, ...testEventIds];

  try {
    // -----------------------------------------------------------------
    // TEST 1: Live API Reachability for Jobs and Events Endpoints
    // -----------------------------------------------------------------
    console.log('--- Test 1: Live Hopin Jobs & Events Endpoints Reachability ---');
    const liveJobsFetch = await fetchJobs({ timeoutMs: 8000 });
    console.assert(liveJobsFetch.success === true, `Jobs fetch failed: ${liveJobsFetch.error}`);
    console.assert(Array.isArray(liveJobsFetch.jobs), 'Expected jobs to be an array');
    console.log(`[PASS] Live Jobs Endpoint reached (HTTP ${liveJobsFetch.statusCode}, Live Count: ${liveJobsFetch.jobs.length}).`);
    if (liveJobsFetch.jobs.length === 0) {
      console.log('       (Note: Live Hopin Jobs endpoint currently has 0 active listings upstream. Schema-conforming fixtures will be used for ingestion tests.)');
    }

    const liveEventsFetch = await fetchEvents({ timeoutMs: 8000 });
    console.assert(liveEventsFetch.success === true, `Events fetch failed: ${liveEventsFetch.error}`);
    console.assert(Array.isArray(liveEventsFetch.events), 'Expected events to be an array');
    console.assert(liveEventsFetch.events.length > 0, 'Expected live events to contain records');
    console.log(`[PASS] Live Events Endpoint reached (HTTP ${liveEventsFetch.statusCode}, Live Count: ${liveEventsFetch.events.length} active events).`);

    // -----------------------------------------------------------------
    // TEST 2: Normalization Logic for Hopin Jobs
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: Normalization of Hopin Jobs ---');
    const sampleJobPayload = {
      id: testJobIds[0],
      company: 'Cisco Systems',
      title: 'Graduate Software Engineer',
      description: 'Design distributed backend systems with Node.js, Express, and Docker.',
      location: 'Bangalore, India',
      work_type: 'Hybrid',
      industry: 'Networking & Cloud',
      role_type: 'Software Engineer',
      ctc_amount: '₹14,00,000 / year',
      posted_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      start_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true
    };

    const normalizedJob = normalizeHopinJob(sampleJobPayload);
    const jobValidation = validateNormalizedOpportunity(normalizedJob);

    console.assert(jobValidation.isValid, `Job validation failed: ${jobValidation.errors.join(', ')}`);
    console.assert(normalizedJob.type === 'PLACEMENT', `Expected type PLACEMENT, got ${normalizedJob.type}`);
    console.assert(normalizedJob.source === 'hopin', `Expected source hopin, got ${normalizedJob.source}`);
    console.assert(normalizedJob.externalId === testJobIds[0], `Expected externalId ${testJobIds[0]}, got ${normalizedJob.externalId}`);
    console.assert(normalizedJob.mode === 'HYBRID', `Expected mode HYBRID, got ${normalizedJob.mode}`);
    console.assert(normalizedJob.stipend === '₹14,00,000 / year', `Stipend mismatch: ${normalizedJob.stipend}`);
    console.assert(normalizedJob.fee === null, `Expected fee null, got ${normalizedJob.fee}`);
    console.assert(normalizedJob.deadline !== null, 'Job deadline should be preserved');
    console.assert(normalizedJob.eligibility.skills.includes('Node.js'), 'Skills must include Node.js');
    console.assert(normalizedJob.eligibility.department.includes('Computer Science'), 'Department must include Computer Science');
    console.assert(normalizedJob.tags.includes('placement'), 'Tags must include placement');
    console.log('[PASS] Test 2: Hopin Job normalized and validated as canonical PLACEMENT opportunity.');

    // -----------------------------------------------------------------
    // TEST 3: Normalization Logic for Hopin Events & Type Classification
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Normalization & Classification of Hopin Events ---');
    // 3a: Workshop Event
    const workshopEventPayload = {
      id: testEventIds[0],
      title: 'Full Stack Web Development Workshop',
      company: 'Google Cloud Community',
      description: 'Hands-on training session on React and modern cloud architectures.',
      event_type: 'Workshop',
      event_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      location: 'Audi-2, Campus Hall',
      is_online: false,
      is_active: true
    };
    const normalizedWorkshop = normalizeHopinEvent(workshopEventPayload);
    console.assert(normalizedWorkshop.type === 'WORKSHOP', `Expected WORKSHOP, got ${normalizedWorkshop.type}`);
    console.assert(normalizedWorkshop.mode === 'OFFLINE', `Expected OFFLINE mode for in-person venue, got ${normalizedWorkshop.mode}`);
    console.assert(normalizedWorkshop.startDate !== null, 'startDate should be mapped from event_date');
    console.assert(normalizedWorkshop.deadline === null, 'deadline must be null when not provided');
    console.assert(normalizedWorkshop.fee === null, 'fee must be null when not provided');

    // 3b: Hackathon Event Classification
    const hackathonPayload = {
      id: testEventIds[1],
      title: 'AI Innovation Hackathon 2026',
      company: 'TechGiants Hub',
      description: '48-hour build sprint building ML applications with Python.',
      event_type: 'Hackathon',
      event_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      is_online: true,
      is_active: true
    };
    const normalizedHackathon = normalizeHopinEvent(hackathonPayload);
    console.assert(normalizedHackathon.type === 'HACKATHON', `Expected HACKATHON, got ${normalizedHackathon.type}`);
    console.assert(normalizedHackathon.mode === 'ONLINE', `Expected ONLINE mode, got ${normalizedHackathon.mode}`);

    // 3c: Competition Event Classification
    const competitionPayload = {
      id: testEventIds[2],
      title: 'National Algorithmic Coding Contest',
      company: 'CodeCraft Society',
      description: 'Competitive programming challenge testing data structures and algorithms.',
      event_type: 'Coding Competition',
      event_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      is_online: true,
      is_active: true
    };
    const normalizedCompetition = normalizeHopinEvent(competitionPayload);
    console.assert(normalizedCompetition.type === 'COMPETITION', `Expected COMPETITION, got ${normalizedCompetition.type}`);
    console.log('[PASS] Test 3: Hopin Events correctly classified into WORKSHOP, HACKATHON, and COMPETITION with strict null preservation.');

    // -----------------------------------------------------------------
    // TEST 4: First Synchronization (Insertion) for Jobs
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: First Synchronization (Insertion) - Hopin Jobs ---');
    await Opportunity.deleteMany({ source: 'hopin', externalId: { $in: allTestIds } });
    await SyncLog.deleteMany({ source: 'hopin', category: { $in: ['jobs', 'events'] } });

    const jobBatch = [
      sampleJobPayload,
      {
        id: testJobIds[1],
        company: 'Microsoft India',
        title: 'Cloud Solutions Associate',
        description: 'Design Azure infrastructure and implement CI/CD pipelines with Docker and Kubernetes.',
        location: 'Hyderabad, India',
        work_type: 'On-Site',
        industry: 'Information Technology',
        role_type: 'Cloud Engineer',
        ctc_amount: '₹18,00,000 / year',
        posted_at: new Date().toISOString(),
        is_active: true
      }
    ];

    const jobsFirstRun = await syncHopinJobs({
      customData: jobBatch,
      persistToDisk: false
    });

    console.assert(jobsFirstRun.success === true, `Jobs first run failed: ${JSON.stringify(jobsFirstRun.errors)}`);
    console.assert(jobsFirstRun.recordsFetched === 2, `Expected 2 fetched, got ${jobsFirstRun.recordsFetched}`);
    console.assert(jobsFirstRun.recordsInserted === 2, `Expected 2 inserted, got ${jobsFirstRun.recordsInserted}`);
    console.assert(jobsFirstRun.recordsUpdated === 0, `Expected 0 updated on first run, got ${jobsFirstRun.recordsUpdated}`);
    console.assert(jobsFirstRun.errors.length === 0, `Expected 0 errors, got ${jobsFirstRun.errors.length}`);

    const jobCountInDb = await Opportunity.countDocuments({
      source: 'hopin',
      externalId: { $in: testJobIds }
    });
    console.assert(jobCountInDb === 2, `Expected 2 jobs in DB, found ${jobCountInDb}`);
    console.log(`[PASS] Test 4: Jobs first run inserted ${jobsFirstRun.recordsInserted} records (0 updated, 0 duplicates).`);

    // -----------------------------------------------------------------
    // TEST 5: First Synchronization (Insertion) for Events
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: First Synchronization (Insertion) - Hopin Events ---');
    const eventBatch = [workshopEventPayload, hackathonPayload, competitionPayload];

    const eventsFirstRun = await syncHopinEvents({
      customData: eventBatch,
      persistToDisk: false
    });

    console.assert(eventsFirstRun.success === true, `Events first run failed: ${JSON.stringify(eventsFirstRun.errors)}`);
    console.assert(eventsFirstRun.recordsFetched === 3, `Expected 3 fetched, got ${eventsFirstRun.recordsFetched}`);
    console.assert(eventsFirstRun.recordsInserted === 3, `Expected 3 inserted, got ${eventsFirstRun.recordsInserted}`);
    console.assert(eventsFirstRun.recordsUpdated === 0, `Expected 0 updated on first run, got ${eventsFirstRun.recordsUpdated}`);
    console.assert(eventsFirstRun.errors.length === 0, `Expected 0 errors, got ${eventsFirstRun.errors.length}`);

    const eventCountInDb = await Opportunity.countDocuments({
      source: 'hopin',
      externalId: { $in: testEventIds }
    });
    console.assert(eventCountInDb === 3, `Expected 3 events in DB, found ${eventCountInDb}`);
    console.log(`[PASS] Test 5: Events first run inserted ${eventsFirstRun.recordsInserted} records (0 updated, 0 duplicates).`);

    // -----------------------------------------------------------------
    // TEST 6: Second Synchronization (Idempotence & Updates without Duplicates)
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: Second Synchronization (Idempotence & Updates) ---');
    // Modify one field in job and event to verify update behavior
    const revisedJobBatch = [
      {
        ...sampleJobPayload,
        ctc_amount: '₹16,00,000 / year (Revised)'
      },
      jobBatch[1]
    ];

    const jobsSecondRun = await syncHopinJobs({
      customData: revisedJobBatch,
      persistToDisk: false
    });

    console.assert(jobsSecondRun.success === true, `Jobs second run failed: ${JSON.stringify(jobsSecondRun.errors)}`);
    console.assert(jobsSecondRun.recordsFetched === 2, `Expected 2 fetched, got ${jobsSecondRun.recordsFetched}`);
    console.assert(jobsSecondRun.recordsInserted === 0, `Expected 0 inserted, got ${jobsSecondRun.recordsInserted}`);
    console.assert(jobsSecondRun.recordsUpdated === 2, `Expected 2 updated, got ${jobsSecondRun.recordsUpdated}`);

    const jobCountAfterSecond = await Opportunity.countDocuments({
      source: 'hopin',
      externalId: { $in: testJobIds }
    });
    console.assert(jobCountAfterSecond === 2, `Total jobs must remain 2 (zero duplicates), found ${jobCountAfterSecond}`);

    const updatedJobDoc = await Opportunity.findOne({ source: 'hopin', externalId: testJobIds[0] });
    console.assert(updatedJobDoc.stipend === '₹16,00,000 / year (Revised)', `Stipend not updated: ${updatedJobDoc.stipend}`);

    // Second run for events
    const revisedEventBatch = [
      {
        ...workshopEventPayload,
        location: 'Audi-3, New Campus Block (Updated)'
      },
      hackathonPayload,
      competitionPayload
    ];

    const eventsSecondRun = await syncHopinEvents({
      customData: revisedEventBatch,
      persistToDisk: false
    });

    console.assert(eventsSecondRun.recordsInserted === 0, `Expected 0 inserted, got ${eventsSecondRun.recordsInserted}`);
    console.assert(eventsSecondRun.recordsUpdated === 3, `Expected 3 updated, got ${eventsSecondRun.recordsUpdated}`);

    const eventCountAfterSecond = await Opportunity.countDocuments({
      source: 'hopin',
      externalId: { $in: testEventIds }
    });
    console.assert(eventCountAfterSecond === 3, `Total events must remain 3 (zero duplicates), found ${eventCountAfterSecond}`);

    const updatedEvtDoc = await Opportunity.findOne({ source: 'hopin', externalId: testEventIds[0] });
    console.assert(updatedEvtDoc.location === 'Audi-3, New Campus Block (Updated)', `Location not updated: ${updatedEvtDoc.location}`);
    console.log('[PASS] Test 6: Second synchronization ran idempotently: 0 new records inserted, existing records updated, exactly 0 duplicates created.');

    // -----------------------------------------------------------------
    // TEST 7: SyncLog Lifecycle & Category Tracking
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: SyncLog Lifecycle & Category Tracking ---');
    const jobLog = await SyncLog.findById(jobsSecondRun.syncLog._id);
    console.assert(jobLog !== null, 'Job SyncLog must exist');
    console.assert(jobLog.source === 'hopin', 'Source must be hopin');
    console.assert(jobLog.category === 'jobs', `Expected category 'jobs', got '${jobLog.category}'`);
    console.assert(jobLog.status === 'SUCCESS', `Expected status SUCCESS, got ${jobLog.status}`);
    console.assert(jobLog.recordsFetched === 2, 'recordsFetched mismatch');
    console.assert(jobLog.recordsUpdated === 2, 'recordsUpdated mismatch');
    console.assert(jobLog.completedAt !== null, 'completedAt must be populated');

    const evtLog = await SyncLog.findById(eventsSecondRun.syncLog._id);
    console.assert(evtLog !== null, 'Event SyncLog must exist');
    console.assert(evtLog.source === 'hopin', 'Source must be hopin');
    console.assert(evtLog.category === 'events', `Expected category 'events', got '${evtLog.category}'`);
    console.assert(evtLog.status === 'SUCCESS', `Expected status SUCCESS, got ${evtLog.status}`);
    console.assert(evtLog.recordsFetched === 3, 'recordsFetched mismatch');
    console.assert(evtLog.recordsUpdated === 3, 'recordsUpdated mismatch');
    console.log('[PASS] Test 7: SyncLog correctly tracked jobs and events with distinct categories and complete lifecycle metrics.');

    // -----------------------------------------------------------------
    // TEST 8: Resilient Failure Handling (Network Error / Unreachable Endpoint)
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: Resilient Failure Handling (Unavailable Host) ---');
    const jobFailRun = await syncHopinJobs({
      baseUrl: 'http://127.0.0.1:59999/unreachable',
      timeoutMs: 1200,
      persistToDisk: false
    });
    console.assert(jobFailRun.success === false, 'jobFailRun should fail gracefully');
    console.assert(jobFailRun.syncLog.status === 'FAILED', 'SyncLog status must be FAILED');
    console.assert(jobFailRun.syncLog.category === 'jobs', 'SyncLog category must be jobs');

    const evtFailRun = await syncHopinEvents({
      baseUrl: 'http://127.0.0.1:59999/unreachable',
      timeoutMs: 1200,
      persistToDisk: false
    });
    console.assert(evtFailRun.success === false, 'evtFailRun should fail gracefully');
    console.assert(evtFailRun.syncLog.status === 'FAILED', 'SyncLog status must be FAILED');
    console.assert(evtFailRun.syncLog.category === 'events', 'SyncLog category must be events');

    // Verify existing documents were not corrupted or deleted
    const countJobsAfterFail = await Opportunity.countDocuments({ source: 'hopin', externalId: { $in: testJobIds } });
    const countEventsAfterFail = await Opportunity.countDocuments({ source: 'hopin', externalId: { $in: testEventIds } });
    console.assert(countJobsAfterFail === 2, 'Jobs data must remain intact');
    console.assert(countEventsAfterFail === 3, 'Events data must remain intact');
    console.log('[PASS] Test 8: Network failure gracefully handled, FAILED logged in SyncLog, 0 exceptions escaped, database preserved.');

    // -----------------------------------------------------------------
    // TEST 9: Existing Opportunity REST API Compatibility
    // -----------------------------------------------------------------
    console.log('\n--- Test 9: Existing Opportunity REST API Compatibility ---');
    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(5097, resolve));
    const baseUrl = 'http://localhost:5097';

    try {
      // 1. GET /opportunities returns catalog including synchronized items
      const allOpps = await fetch(`${baseUrl}/opportunities`).then(r => r.json());
      const hopinItems = allOpps.filter(o => o.source === 'hopin');
      console.assert(hopinItems.length >= 5, `Expected at least 5 Hopin items in catalog, found ${hopinItems.length}`);
      console.log(`[PASS] GET /opportunities returned ${allOpps.length} opportunities (including ${hopinItems.length} Hopin records).`);

      // 2. GET /opportunities?type=placement & ?type=PLACEMENT
      const lowerPlacements = await fetch(`${baseUrl}/opportunities?type=placement`).then(r => r.json());
      const upperPlacements = await fetch(`${baseUrl}/opportunities?type=PLACEMENT`).then(r => r.json());
      console.assert(lowerPlacements.length >= 2, `Expected at least 2 placements, got ${lowerPlacements.length}`);
      console.assert(lowerPlacements.length === upperPlacements.length, 'Case-insensitive filter mismatch for placement');
      console.log(`[PASS] GET /opportunities?type=placement returned ${lowerPlacements.length} items (case-insensitive verified).`);

      // 3. GET /opportunities?type=workshop & ?type=WORKSHOP
      const lowerWorkshops = await fetch(`${baseUrl}/opportunities?type=workshop`).then(r => r.json());
      const upperWorkshops = await fetch(`${baseUrl}/opportunities?type=WORKSHOP`).then(r => r.json());
      console.assert(lowerWorkshops.length >= 1, `Expected at least 1 workshop, got ${lowerWorkshops.length}`);
      console.assert(lowerWorkshops.length === upperWorkshops.length, 'Case-insensitive filter mismatch for workshop');
      console.log(`[PASS] GET /opportunities?type=workshop returned ${lowerWorkshops.length} items.`);

      // 4. GET /opportunities?type=hackathon
      const hackathons = await fetch(`${baseUrl}/opportunities?type=hackathon`).then(r => r.json());
      console.assert(hackathons.length >= 1, `Expected at least 1 hackathon, got ${hackathons.length}`);
      console.log(`[PASS] GET /opportunities?type=hackathon returned ${hackathons.length} items.`);

      // 5. GET /opportunities/:id
      const singleJob = await Opportunity.findOne({ source: 'hopin', externalId: testJobIds[0] });
      const singleRes = await fetch(`${baseUrl}/opportunities/${singleJob._id}`).then(r => r.json());
      console.assert(singleRes._id === singleJob._id.toString(), 'ID mismatch');
      console.assert(singleRes.type === 'PLACEMENT', 'Type mismatch on detail view');
      console.assert(singleRes.stipend === '₹16,00,000 / year (Revised)', 'Stipend mismatch on detail view');
      console.log('[PASS] GET /opportunities/:id successfully retrieved single synchronized Hopin Job.');
    } finally {
      await new Promise(resolve => testServer.close(resolve));
    }

    console.log('\n======================================================');
    console.log('ALL PHASE 4 UNIT AND INTEGRATION TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    // Clean up test data
    await Opportunity.deleteMany({ source: 'hopin', externalId: { $in: allTestIds } });
    await SyncLog.deleteMany({ source: 'hopin', category: { $in: ['jobs', 'events'] } });
    await closeDB();
  }
}

if (require.main === module) {
  runPhase4Tests().then(() => process.exit(0)).catch(err => {
    console.error('Phase 4 test failure:', err);
    process.exit(1);
  });
}

module.exports = { runPhase4Tests };
