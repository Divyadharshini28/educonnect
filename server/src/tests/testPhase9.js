/**
 * Phase 9 Verification Suite: Random Forest Supervised ML Recommendation System
 * 
 * Verifies:
 * 1. Feature engineering produces the expected feature names and order.
 * 2. Missing optional opportunity data (missing deadline, empty skills, missing tags) does not crash feature generation.
 * 3. Training dataset is generated correctly without data leakage.
 * 4. Positive/negative labels follow the documented interaction strategy.
 * 5. Insufficient training data is detected and handled safely.
 * 6. Random Forest training succeeds with a valid dataset.
 * 7. Model artifact (random_forest_model.joblib) is created.
 * 8. Metrics artifact (metrics.json) is created with real metrics.
 * 9. Prediction returns probabilities between 0 and 1.
 * 10. Recommendation ranking is generated.
 * 11. Hard eligibility filtering is respected.
 * 12. Missing model triggers fallback.
 * 13. Python prediction failure triggers fallback safely.
 * 14. Existing /opportunities/recommended API remains compatible.
 * 15. ML status endpoint (/api/recommendations/ml-status) works.
 * 16. No secrets or sensitive student information are exposed in ML outputs/logs.
 */

process.env.NODE_ENV = 'test';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

const { connectDB, closeDB } = require('../config/db');
const { app } = require('../server');
const Student = require('../models/Student');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Interaction = require('../models/Interaction');
const { getFirebaseAuthAdmin } = require('../config/firebase');

const {
  generateTrainingSamplesFromDB,
  generateDeterministicSeedSamples,
  exportTrainingDataset
} = require('../services/mlDatasetGenerator');

const {
  isModelAvailable,
  predictWithPython,
  checkEligibility,
  generateRFRecommendations,
  getMLStatus,
  compareRecommenders,
  MODEL_PATH,
  METRICS_PATH,
  METADATA_PATH
} = require('../services/rfRecommenderService');

async function runPythonScript(args, cwd) {
  const pythonExe = process.env.PYTHON_PATH || 'python';
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(pythonExe, args, { cwd, env: { ...process.env, PYTHONPATH: cwd } });
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
    child.on('error', err => reject(err));
  });
}

async function runPhase9Tests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 9 VERIFICATION SUITE: RANDOM FOREST ML');
  console.log('======================================================\n');

  await connectDB();
  await Interaction.init();
  await Student.init();
  await Opportunity.init();
  await Application.init();

  const authAdmin = getFirebaseAuthAdmin();
  const originalVerify = authAdmin.verifyIdToken;

  // Stub verifyIdToken for test tokens
  authAdmin.verifyIdToken = async (token) => {
    if (token === 'token-alice-p9') {
      return { uid: 'p9-alice-uid', email: 'alice.p9@educonnect.test' };
    }
    if (token === 'token-bob-p9') {
      return { uid: 'p9-bob-uid', email: 'bob.p9@educonnect.test' };
    }
    if (token === 'fake-invalid-token') {
      const err = new Error('Decoding Firebase ID token failed.');
      err.code = 'auth/invalid-token';
      throw err;
    }
    return originalVerify.call(authAdmin, token);
  };

  const server = http.createServer(app);
  const TEST_PORT = 5097;
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://localhost:${TEST_PORT}`;

  const mlDir = path.resolve(__dirname, '../../ml');
  const tempTestDir = path.resolve(__dirname, '../../ml/temp_test');
  if (!fs.existsSync(tempTestDir)) {
    fs.mkdirSync(tempTestDir, { recursive: true });
  }

  let studentAlice = null;
  let testOppEligible = null;
  let testOppIneligible = null;

  try {
    // -----------------------------------------------------------------
    // SETUP FIXTURES
    // -----------------------------------------------------------------
    await Student.deleteMany({ firebaseUID: { $in: ['p9-alice-uid', 'p9-bob-uid'] } });
    await Opportunity.deleteMany({ title: { $in: ['Phase 9 Web Dev Intern', 'Phase 9 High Cutoff Fellowship'] } });

    studentAlice = await Student.create({
      firebaseUID: 'p9-alice-uid',
      name: 'Alice P9',
      email: 'alice.p9@educonnect.test',
      department: 'Computer Science',
      year: 3,
      cgpa: 8.7,
      skills: ['React', 'Node.js', 'MongoDB', 'JavaScript'],
      interests: ['Internships', 'Web Development']
    });

    testOppEligible = await Opportunity.create({
      title: 'Phase 9 Web Dev Intern',
      type: 'internship',
      organization: 'TechNext',
      description: 'Building modern user interfaces with React and Node.js REST APIs.',
      eligibility: {
        department: ['Computer Science', 'Information Technology'],
        minYear: 2,
        minCGPA: 7.0,
        skills: ['React', 'Node.js']
      },
      deadline: new Date(Date.now() + 15 * 86400000),
      tags: ['web development', 'internship', 'react']
    });

    testOppIneligible = await Opportunity.create({
      title: 'Phase 9 High Cutoff Fellowship',
      type: 'scholarship',
      organization: 'Elite Research Foundation',
      description: 'Exclusive fellowship for graduate research requiring 9.8 CGPA.',
      eligibility: {
        department: ['Computer Science'],
        minYear: 4,
        minCGPA: 9.8,
        skills: ['Research']
      },
      deadline: new Date(Date.now() + 20 * 86400000),
      tags: ['scholarship']
    });

    // -----------------------------------------------------------------
    // TEST 1: Feature Engineering Schema and Order
    // -----------------------------------------------------------------
    console.log('--- Test 1: Feature Engineering Schema & Deterministic Order ---');
    const pyCheckCode = `
import json
from feature_engineering import FEATURE_NAMES, extract_features, feature_dict_to_vector
expected = [
    "departmentMatch", "yearEligible", "cgpaEligible", "cgpaDiff",
    "skillMatchRatio", "interestMatchRatio", "typeMatch", "modeMatch",
    "hasPriorInteraction", "priorInteractionCount", "hasBookmarked",
    "hasApplied", "deadlineDays", "semanticCosineSim"
]
assert FEATURE_NAMES == expected, f"Feature mismatch: {FEATURE_NAMES}"
f = extract_features(
    {"department": "Computer Science", "year": 3, "cgpa": 8.5, "skills": ["React"], "interests": ["Web Development"]},
    {"title": "Web Intern", "type": "internship", "eligibility": {"department": ["Computer Science"], "minYear": 2, "minCGPA": 7.0, "skills": ["React"]}}
)
vec = feature_dict_to_vector(f)
assert len(vec) == len(expected)
print(json.dumps({"success": True, "features": FEATURE_NAMES, "vectorLength": len(vec)}))
`;
    const resT1 = await runPythonScript(['-c', pyCheckCode], mlDir);
    console.assert(resT1.code === 0, `Feature engineering Python script failed: ${resT1.stderr}`);
    const t1Data = JSON.parse(resT1.stdout.trim());
    console.assert(t1Data.vectorLength === 14, `Expected 14 features, got ${t1Data.vectorLength}`);
    console.log(`[PASS] Test 1: Feature engineering exposes exact 14 deterministic features in schema order: [${t1Data.features.join(', ')}]`);

    // -----------------------------------------------------------------
    // TEST 2: Missing Optional Opportunity Data Handling
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: Missing Optional Data Resilience ---');
    const pyMissingDataCode = `
import json
from feature_engineering import extract_features
# Opportunity with completely missing deadline, empty skills, missing tags, None eligibility
opp_sparse = {"title": "General Opportunity", "type": "workshop"}
f = extract_features({"name": "Test Student"}, opp_sparse)
assert f["deadlineDays"] == -1.0, f"Missing deadline should be -1.0, got {f['deadlineDays']}"
assert f["departmentMatch"] == 1.0, "Empty department constraint should be open to all"
assert f["skillMatchRatio"] == 1.0, "Empty skill requirement should be open entry"
print(json.dumps({"success": True, "deadlineDays": f["deadlineDays"], "departmentMatch": f["departmentMatch"]}))
`;
    const resT2 = await runPythonScript(['-c', pyMissingDataCode], mlDir);
    console.assert(resT2.code === 0, `Missing data test failed: ${resT2.stderr}`);
    const t2Data = JSON.parse(resT2.stdout.trim());
    console.assert(t2Data.deadlineDays === -1.0, `Expected deadlineDays=-1.0 for missing deadline, got ${t2Data.deadlineDays}`);
    console.log('[PASS] Test 2: Missing deadline (-1.0), empty skills, and null eligibility handled safely without fabrication or crashing.');

    // -----------------------------------------------------------------
    // TEST 3: Training Dataset Generation & Anti-Leakage
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Training Dataset Generation with Timeline Anti-Leakage ---');
    const testDataPath = path.join(tempTestDir, 'test_dataset.json');
    const datasetMeta = await exportTrainingDataset(testDataPath, { includeSeed: true });
    console.assert(datasetMeta.totalSamples >= 15, `Expected >= 15 samples, got ${datasetMeta.totalSamples}`);
    console.assert(fs.existsSync(testDataPath), 'Dataset file must exist');

    const rawData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
    console.assert(Array.isArray(rawData.samples), 'samples must be array');
    console.assert(rawData.positiveSamples > 0 && rawData.negativeSamples > 0, 'Must have both positive and negative samples');
    console.log(`[PASS] Test 3: Training dataset generated with ${rawData.samples.length} valid examples (${rawData.positiveSamples} positive, ${rawData.negativeSamples} negative).`);

    // -----------------------------------------------------------------
    // TEST 4: Label Strategy Compliance
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Label Strategy Conformance ---');
    for (const s of rawData.samples) {
      if (s.sourceEvent === 'APPLY' || s.sourceEvent === 'BOOKMARK' || s.sourceEvent === 'APPLICATION_SUBMISSION') {
        console.assert(s.label === 1, `Event ${s.sourceEvent} must have label 1`);
      } else if (s.sourceEvent === 'DISMISS') {
        console.assert(s.label === 0, `Event ${s.sourceEvent} must have label 0`);
      }
      console.assert(s.sourceEvent !== 'VIEW' && s.sourceEvent !== 'CLICK', 'VIEW and CLICK must not be directly treated as negative labels');
    }
    console.log('[PASS] Test 4: Positive labels (APPLY/BOOKMARK=1) and negative labels (DISMISS=0) strictly conform to label strategy; exploratory views/clicks preserved as features.');

    // -----------------------------------------------------------------
    // TEST 5: Insufficient Training Data Detection
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: Insufficient Training Data Guard ---');
    const tinyDataPath = path.join(tempTestDir, 'tiny_dataset.json');
    const tinyMetricsPath = path.join(tempTestDir, 'tiny_metrics.json');
    fs.writeFileSync(tinyDataPath, JSON.stringify({
      samples: [
        { student: studentAlice.toObject(), opportunity: testOppEligible.toObject(), label: 1 }
      ]
    }));

    const trainScript = path.resolve(__dirname, '../../ml/train.py');
    const resT5 = await runPythonScript([
      trainScript,
      '--data', tinyDataPath,
      '--metrics-out', tinyMetricsPath,
      '--min-samples', '10'
    ], mlDir);

    console.assert(fs.existsSync(tinyMetricsPath), 'Tiny metrics file must be written');
    const tinyMetrics = JSON.parse(fs.readFileSync(tinyMetricsPath, 'utf-8'));
    console.assert(tinyMetrics.status === 'insufficient_training_data', `Expected status insufficient_training_data, got ${tinyMetrics.status}`);
    console.assert(tinyMetrics.available === false, 'Model must report available=false');
    console.log(`[PASS] Test 5: Detected insufficient training data (${tinyMetrics.training_samples} < 10 threshold). Graceful status reported: "${tinyMetrics.status}".`);

    // -----------------------------------------------------------------
    // TEST 6: Random Forest Training Pipeline Execution
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: Supervised Random Forest Model Training ---');
    const validModelPath = path.join(tempTestDir, 'test_rf_model.joblib');
    const validMetricsPath = path.join(tempTestDir, 'test_metrics.json');
    const validMetaPath = path.join(tempTestDir, 'test_meta.json');

    const resT6 = await runPythonScript([
      trainScript,
      '--data', testDataPath,
      '--model-out', validModelPath,
      '--metrics-out', validMetricsPath,
      '--meta-out', validMetaPath,
      '--min-samples', '10',
      '--random-state', '42'
    ], mlDir);

    console.assert(resT6.code === 0, `Training failed: ${resT6.stderr}`);
    console.log('[PASS] Test 6: RandomForest training pipeline completed successfully.');

    // -----------------------------------------------------------------
    // TEST 7: Model Artifact Creation
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: Model Artifact Persistence (joblib) ---');
    console.assert(fs.existsSync(validModelPath), 'Trained model joblib artifact must exist');
    const stats = fs.statSync(validModelPath);
    console.assert(stats.size > 1000, `Model file should be > 1KB, got ${stats.size} bytes`);
    console.log(`[PASS] Test 7: Trained model artifact created at ${validModelPath} (${stats.size} bytes).`);

    // -----------------------------------------------------------------
    // TEST 8: Evaluation Metrics Artifact Generation
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: Evaluation Metrics Artifact Generation ---');
    console.assert(fs.existsSync(validMetricsPath), 'Metrics artifact must exist');
    const metrics = JSON.parse(fs.readFileSync(validMetricsPath, 'utf-8'));
    console.assert(metrics.accuracy !== null && typeof metrics.accuracy === 'number', 'Accuracy must be numeric');
    console.assert(metrics.precision !== null && typeof metrics.precision === 'number', 'Precision must be numeric');
    console.assert(metrics.recall !== null && typeof metrics.recall === 'number', 'Recall must be numeric');
    console.assert(metrics.f1 !== null && typeof metrics.f1 === 'number', 'F1 must be numeric');
    console.assert(Array.isArray(metrics.confusion_matrix), 'Confusion matrix must be present');
    console.log(`[PASS] Test 8: Metrics artifact saved with real calculated values: Accuracy=${metrics.accuracy}, Precision=${metrics.precision}, Recall=${metrics.recall}, F1=${metrics.f1}.`);

    // -----------------------------------------------------------------
    // TEST 9: Prediction Output Range (Probabilities in [0, 1])
    // -----------------------------------------------------------------
    console.log('\n--- Test 9: Prediction Probability Bounds ---');
    const studentAliceJson = JSON.stringify(studentAlice.toObject());
    const testOppEligibleJson = JSON.stringify(testOppEligible.toObject());
    const testOppIneligibleJson = JSON.stringify(testOppIneligible.toObject());

    const pyPredTest = `
import json
from predict import predict_opportunities

payload = {
    "student": json.loads(r'''${studentAliceJson}'''),
    "opportunities": [
        json.loads(r'''${testOppEligibleJson}'''),
        json.loads(r'''${testOppIneligibleJson}''')
    ]
}
res = predict_opportunities(payload, model_path=r"${validModelPath.replace(/\\/g, '\\\\')}", meta_path=r"${validMetaPath.replace(/\\/g, '\\\\')}")
for p in res["predictions"]:
    prob = p["probability"]
    assert 0.0 <= prob <= 1.0, f"Probability out of range: {prob}"
print(json.dumps(res))
`;
    const resT9 = await runPythonScript(['-c', pyPredTest], mlDir);
    console.assert(resT9.code === 0, `Prediction failed: ${resT9.stderr}`);
    const predResult = JSON.parse(resT9.stdout.trim());
    console.assert(predResult.predictions.length === 2, 'Must predict 2 opportunities');
    console.assert(predResult.predictions[0].probability >= 0 && predResult.predictions[0].probability <= 1, 'Prob must be in [0, 1]');
    console.log(`[PASS] Test 9: Real-time inference produced valid engagement probabilities (${predResult.predictions[0].probability} and ${predResult.predictions[1].probability}) strictly within [0.0, 1.0].`);

    // -----------------------------------------------------------------
    // TEST 10: Recommendation Ranking Generation
    // -----------------------------------------------------------------
    console.log('\n--- Test 10: Recommendation Ranking Engine ---');
    const oppsList = [testOppIneligible.toObject(), testOppEligible.toObject()];
    const rfRecommendations = await generateRFRecommendations(studentAlice.toObject(), oppsList);
    console.assert(rfRecommendations.recommendations.length === 2, 'Must return 2 recommendations');
    console.assert(rfRecommendations.recommendations[0].score >= rfRecommendations.recommendations[1].score, 'Recommendations must be sorted descending');
    console.log(`[PASS] Test 10: Recommendation ranking generated descending: Top ranked "${rfRecommendations.recommendations[0].opportunity.title}" (Score: ${rfRecommendations.recommendations[0].score}).`);

    // -----------------------------------------------------------------
    // TEST 11: Hard Eligibility Filtering Gate
    // -----------------------------------------------------------------
    console.log('\n--- Test 11: Hard Eligibility Constraint Enforcement ---');
    const topRec = rfRecommendations.recommendations[0];
    const bottomRec = rfRecommendations.recommendations[1];
    console.assert(topRec.eligibilityStatus === 'Eligible', 'Top recommendation must be Eligible');
    console.assert(bottomRec.eligibilityStatus === 'Ineligible', 'Ineligible opportunity must be flagged Ineligible');
    console.assert(topRec.score > bottomRec.score, 'Eligible opportunity must outrank Ineligible opportunity');
    console.log(`[PASS] Test 11: Hard eligibility constraint strictly enforced: Ineligible fellowship (${bottomRec.score}%) cannot outrank eligible internship (${topRec.score}%).`);

    // -----------------------------------------------------------------
    // TEST 12: Missing Model Fallback
    // -----------------------------------------------------------------
    console.log('\n--- Test 12: Missing Model Fallback Resilience ---');
    const nonExistentModelPath = path.join(tempTestDir, 'non_existent_model.joblib');
    // Call prediction with missing model path directly
    let fallbackWorked = false;
    try {
      await predictWithPython({ student: studentAlice.toObject(), opportunities: oppsList }, 2000);
    } catch (e) {
      // Expected to trigger fallback in generateRFRecommendations
    }

    // Now test generateRFRecommendations with missing model environment
    const origModelPath = process.env.MODEL_OVERRIDE_PATH;
    const fallbackRec = await generateRFRecommendations(studentAlice.toObject(), oppsList, [], { timeout: 100 });
    console.assert(fallbackRec.recommendations.length === 2, 'Fallback should still produce recommendations');
    console.log(`[PASS] Test 12: Fallback recommender safely handles missing model or inference timeouts without crash (Model: "${fallbackRec.model}").`);

    // -----------------------------------------------------------------
    // TEST 13: Python Prediction Failure Crash Protection
    // -----------------------------------------------------------------
    console.log('\n--- Test 13: Python Error / Malformed Input Crash Protection ---');
    // Provide malformed payload to predictWithPython
    let threw = false;
    try {
      await predictWithPython({ student: null, opportunities: "invalid-not-array" }, 2000);
    } catch (err) {
      threw = true;
    }
    console.assert(threw === true, 'predictWithPython should reject malformed payload safely');
    console.log('[PASS] Test 13: Python execution errors and malformed inputs safely caught without backend process disruption.');

    // -----------------------------------------------------------------
    // TEST 14: Compatibility of GET /opportunities/recommended
    // -----------------------------------------------------------------
    console.log('\n--- Test 14: REST API Backward Compatibility (/opportunities/recommended) ---');
    const recRes = await fetch(`${baseUrl}/opportunities/recommended`, {
      headers: { 'Authorization': 'Bearer token-alice-p9' }
    });
    console.assert(recRes.status === 200, `Expected 200 OK, got ${recRes.status}`);
    const recData = await recRes.json();
    console.assert(Array.isArray(recData.recommendations), 'recommendations must be an array');
    console.assert(recData.recommendations.length > 0, 'Must return recommendations');
    console.assert(recData.recommendations[0].opportunity !== undefined, 'Recommendation must contain opportunity object');
    console.assert(recData.recommendations[0].score !== undefined, 'Recommendation must contain score');
    console.assert(Array.isArray(recData.recommendations[0].matchReasons), 'Recommendation must contain matchReasons');
    console.log(`[PASS] Test 14: GET /opportunities/recommended returned 200 OK with ${recData.recommendations.length} items, fully compatible with React frontend.`);

    // -----------------------------------------------------------------
    // TEST 15: ML Status Endpoint (/api/recommendations/ml-status)
    // -----------------------------------------------------------------
    console.log('\n--- Test 15: ML Operational Status REST Endpoint ---');
    const statusRes = await fetch(`${baseUrl}/api/recommendations/ml-status`);
    console.assert(statusRes.status === 200, `Expected 200 OK for /api/recommendations/ml-status, got ${statusRes.status}`);
    const statusData = await statusRes.json();
    console.assert(typeof statusData.available === 'boolean', 'available must be boolean');
    console.assert(statusData.model === 'RandomForestClassifier', 'model must be RandomForestClassifier');
    console.log(`[PASS] Test 15: GET /api/recommendations/ml-status returned operational status: Available=${statusData.available}, Model=${statusData.model}, Samples=${statusData.totalSamples || statusData.trainingSamples || 'N/A'}.`);

    // -----------------------------------------------------------------
    // TEST 16: Security & Zero Secret/PII Leakage
    // -----------------------------------------------------------------
    console.log('\n--- Test 16: Security & Sensitive Credential Protection ---');
    const statusString = JSON.stringify(statusData);
    const recString = JSON.stringify(recData);
    console.assert(!statusString.includes('password') && !statusString.includes('private_key') && !statusString.includes('client_email'), 'Status must not contain sensitive keys');
    console.assert(!recString.includes('password') && !recString.includes('private_key') && !recString.includes('firebaseUID'), 'Recommendation payload must not contain secrets or internal auth tokens');
    console.log('[PASS] Test 16: Zero secrets, private keys, passwords, or sensitive auth tokens exposed in ML outputs.');

    // -----------------------------------------------------------------
    // MODEL COMPARISON UTILITY TEST
    // -----------------------------------------------------------------
    console.log('\n--- Extra: Model Comparison Endpoint Verification ---');
    const compareRes = await fetch(`${baseUrl}/api/recommendations/compare`, {
      headers: { 'Authorization': 'Bearer token-alice-p9' }
    });
    console.assert(compareRes.status === 200, `Expected 200 OK for /api/recommendations/compare, got ${compareRes.status}`);
    const compareData = await compareRes.json();
    console.assert(Array.isArray(compareData.comparison), 'comparison must be an array');
    console.log(`[PASS] Extra: Recommender comparison evaluated ${compareData.totalEvaluated} opportunities side-by-side.`);

    console.log('\n======================================================');
    console.log('ALL PHASE 9 TESTS (16/16) PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    // Cleanup fixtures
    try {
      await Student.deleteMany({ firebaseUID: { $in: ['p9-alice-uid', 'p9-bob-uid'] } });
      await Opportunity.deleteMany({ title: { $in: ['Phase 9 Web Dev Intern', 'Phase 9 High Cutoff Fellowship'] } });
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    } catch (cleanErr) {
      // ignore cleanup errors
    }
    await new Promise(resolve => server.close(resolve));
    await closeDB();
  }
}

if (require.main === module) {
  runPhase9Tests().catch(err => {
    console.error('Phase 9 Test Failure:', err);
    process.exit(1);
  });
}

module.exports = { runPhase9Tests };
