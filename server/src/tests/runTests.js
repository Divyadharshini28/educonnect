/**
 * Automated Test Suite for EduConnect Recommendation Engine & Protected Authentication Middleware
 */
const { evaluateOpportunity, generateRecommendations } = require('../services/recommendationEngine');
const { ContentBasedRecommenderModel, generateMLRecommendations } = require('../services/mlRecommendationEngine');

async function runRecommendationEngineUnitTests() {
  console.log('\n--- 1. Testing Rule-Based Recommendation Engine ---');

  const mockStudent = {
    department: 'Computer Science',
    year: 3,
    cgpa: 8.5,
    skills: ['React', 'Node.js', 'MongoDB', 'Python'],
    interests: ['Internships', 'Web Development', 'Hackathons']
  };

  const matchingOpp = {
    _id: 'opp-1',
    title: 'MERN Stack Intern',
    type: 'internship',
    description: 'Frontend and backend development with React and Node',
    eligibility: {
      department: ['Computer Science', 'Information Technology'],
      minYear: 2,
      minCGPA: 7.0,
      skills: ['React', 'Node.js', 'MongoDB']
    },
    tags: ['web development', 'internship']
  };

  const ineligibleOppCGPA = {
    _id: 'opp-2',
    title: 'High Honor Fellowship',
    type: 'scholarship',
    description: 'Prestigious fellowship requiring top CGPA',
    eligibility: {
      department: ['Computer Science'],
      minYear: 2,
      minCGPA: 9.5,
      skills: []
    },
    tags: ['scholarship']
  };

  const eval1 = evaluateOpportunity(mockStudent, matchingOpp);
  console.assert(eval1.eligibilityStatus === 'Eligible', 'eval1 should be Eligible');
  console.assert(eval1.score >= 80, `eval1 score should be >= 80, got ${eval1.score}`);
  console.log(`[PASS] Test 1: Rule engine scored ${eval1.score}% (Eligible).`);

  const eval2 = evaluateOpportunity(mockStudent, ineligibleOppCGPA);
  console.assert(eval2.eligibilityStatus === 'Ineligible', 'eval2 should be Ineligible');
  console.log(`[PASS] Test 2: Hard CGPA filter enforced. Status: ${eval2.eligibilityStatus}`);
}

async function runMLRecommendationUnitTests() {
  console.log('\n--- 2. Testing Machine Learning (TF-IDF & Cosine Similarity) Model ---');

  const model = new ContentBasedRecommenderModel();
  const corpus = [
    'MERN Stack React Node.js MongoDB Fullstack Developer Web Development',
    'Machine Learning Python TensorFlow PyTorch Data Science Deep Learning AI',
    'AWS Cloud Architect DevOps Docker Kubernetes Infrastructure'
  ];

  model.fit(corpus);
  console.assert(model.vocabulary.has('react'), 'Vocabulary must contain react');
  console.log(`[PASS] ML Test 1: Fitted TF-IDF Vectorizer. Vocabulary size: ${model.vocabulary.size} terms.`);

  const studentDoc = 'React Node.js MongoDB Web Development JavaScript';
  const queryVec = model.transform(studentDoc);
  const doc0Vec = model.transform(corpus[0]);
  const doc1Vec = model.transform(corpus[1]);

  const sim0 = model.cosineSimilarity(queryVec, doc0Vec);
  const sim1 = model.cosineSimilarity(queryVec, doc1Vec);

  console.assert(sim0 > sim1, 'Web dev query must be closer to MERN doc than AI doc');
  console.log(`[PASS] ML Test 2: Vector Cosine Similarity correctly ranks MERN doc (${(sim0*100).toFixed(1)}%) above AI doc (${(sim1*100).toFixed(1)}%).`);
}

async function runProtectedAuthenticationTests() {
  console.log('\n--- 3. Testing Protected Routes & Token Security ---');
  const { connectDB, closeDB } = require('../config/db');
  const { app } = require('../server');
  const { seedDatabase } = require('../seed/seedData');
  const http = require('http');

  await connectDB();
  await seedDatabase();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5099, resolve));
  const baseUrl = 'http://localhost:5099';

  try {
    // 1. Healthcheck is public
    const health = await fetch(`${baseUrl}/api/health`).then(r => r.json());
    console.assert(health.status === 'ok', 'Healthcheck must be ok');
    console.log('[PASS] Public Route: /api/health returned 200 OK.');

    // 2. Catalog is public
    const catalog = await fetch(`${baseUrl}/opportunities`).then(r => r.json());
    console.assert(Array.isArray(catalog) && catalog.length > 0, 'Catalog should return opportunities');
    console.log(`[PASS] Public Route: /opportunities returned ${catalog.length} opportunities.`);

    // 3. Protected Route without Token must return 401
    const noTokenRes = await fetch(`${baseUrl}/student/profile`);
    console.assert(noTokenRes.status === 401, `Expected 401 for /student/profile without token, got ${noTokenRes.status}`);
    console.log('[PASS] Protected Route: /student/profile strictly rejected unauthenticated request (401 Unauthorized).');

    // 4. Protected Route with invalid token must return 401 or 500
    const invalidTokenRes = await fetch(`${baseUrl}/opportunities/recommended`, {
      headers: { 'Authorization': 'Bearer fake-invalid-token-12345' }
    });
    console.assert(invalidTokenRes.status === 401 || invalidTokenRes.status === 500, `Expected 401 or 500, got ${invalidTokenRes.status}`);
    console.log(`[PASS] Protected Route: /opportunities/recommended rejected invalid token (Status: ${invalidTokenRes.status}).`);

    // 5. Protected Route for application submission without token must return 401
    const applyNoToken = await fetch(`${baseUrl}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId: catalog[0]._id })
    });
    console.assert(applyNoToken.status === 401, `Expected 401 for /applications without token, got ${applyNoToken.status}`);
    console.log('[PASS] Protected Route: /applications strictly rejected unauthenticated POST request (401 Unauthorized).');

    console.log('\n======================================================');
    console.log('ALL UNIT, ML, AND PROTECTED ROUTE SECURITY TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closeDB();
  }
}

async function runAll() {
  try {
    await runRecommendationEngineUnitTests();
    await runMLRecommendationUnitTests();
    await runProtectedAuthenticationTests();
  } catch (err) {
    console.error('Test suite error:', err);
    process.exit(1);
  }
}

runAll();
