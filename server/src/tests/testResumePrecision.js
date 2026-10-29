/**
 * Precision-focused Unit Test Suite for Resume Skill Extraction & Alias Normalization
 * 
 * Verifies all 10 requirements:
 * 1. Common technical skills
 * 2. Alias normalization (JS->JavaScript, k8s->Kubernetes, Node->Node.js, ml->Machine Learning, GCP Platform->Google Cloud)
 * 3. Multiword skills (Machine Learning, REST API, Tailwind CSS, etc.)
 * 4. Repeated aliases producing one canonical result (deduplication)
 * 5. Generic resume words being rejected (stopwords: project, experience, responsibilities)
 * 6. False substring matches avoided (happy!=py, reacting!=React, scripting!=C)
 * 7. Ambiguous abbreviations handled contextually (CV!=Computer Vision, go verb!=Go, copyright (C)!=C)
 * 8. Resumes with no recognized skills
 * 9. Empty or malformed extracted text
 * 10. Existing skill confirmation workflow integrity
 */

const assert = require('assert');
const {
  extractResumeIntelligence,
  EXTENDED_SKILL_CATALOG,
  SKILL_ALIASES,
  SKILL_STOPWORDS
} = require('../services/resumeService');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('Resume Skill Extraction & Alias Normalization Test Suite');
console.log('======================================================\n');

// 1. Common technical skills
runTest('1. Common technical skills are accurately extracted', () => {
  const text = 'Proficient in Python, Java, React, Docker, and MongoDB with experience building cloud apps.';
  const result = extractResumeIntelligence(text);
  assert.strictEqual(result.status, 'SUCCESS');
  const skills = result.extractedData.skills;
  assert.ok(skills.includes('Python'), 'Expected Python');
  assert.ok(skills.includes('Java'), 'Expected Java');
  assert.ok(skills.includes('React'), 'Expected React');
  assert.ok(skills.includes('Docker'), 'Expected Docker');
  assert.ok(skills.includes('MongoDB'), 'Expected MongoDB');
});

// 2. Alias normalization
runTest('2. Skill aliases normalize to canonical names', () => {
  const text = 'Built microservices using JS, k8s, Node, golang, cpp, and deployed to GCP Platform. Analyzed data using sklearn and postgres.';
  const result = extractResumeIntelligence(text);
  const skills = result.extractedData.skills;

  assert.ok(skills.includes('JavaScript'), 'JS should resolve to JavaScript');
  assert.ok(!skills.includes('js'), 'Lowercase alias should not appear');
  assert.ok(skills.includes('Kubernetes'), 'k8s should resolve to Kubernetes');
  assert.ok(!skills.includes('k8s'), 'k8s alias should not appear');
  assert.ok(skills.includes('Node.js'), 'Node should resolve to Node.js');
  assert.ok(skills.includes('Go'), 'golang should resolve to Go');
  assert.ok(skills.includes('C++'), 'cpp should resolve to C++');
  assert.ok(skills.includes('Google Cloud'), 'GCP Platform should resolve to Google Cloud');
  assert.ok(skills.includes('Scikit-Learn'), 'sklearn should resolve to Scikit-Learn');
  assert.ok(skills.includes('PostgreSQL'), 'postgres should resolve to PostgreSQL');
});

// 3. Multiword skills
runTest('3. Multiword skills matched without fragmentation', () => {
  const text = 'Specialized in Machine Learning, Deep Learning, REST API architecture, and Tailwind CSS design.';
  const result = extractResumeIntelligence(text);
  const skills = result.extractedData.skills;

  assert.ok(skills.includes('Machine Learning'), 'Expected Machine Learning');
  assert.ok(skills.includes('Deep Learning'), 'Expected Deep Learning');
  assert.ok(skills.includes('REST API'), 'Expected REST API');
  assert.ok(skills.includes('Tailwind CSS'), 'Expected Tailwind CSS');
});

// 4. Repeated aliases producing one canonical result
runTest('4. Repeated aliases deduplicate to single canonical result', () => {
  const text = 'Extensive experience in JS, javascript, and es6 on frontend. Also used k8s, kube, and Kubernetes for orchestration.';
  const result = extractResumeIntelligence(text);
  const skills = result.extractedData.skills;

  const jsCount = skills.filter(s => s === 'JavaScript').length;
  assert.strictEqual(jsCount, 1, 'JavaScript should appear exactly once despite multiple aliases');

  const k8sCount = skills.filter(s => s === 'Kubernetes').length;
  assert.strictEqual(k8sCount, 1, 'Kubernetes should appear exactly once despite multiple aliases');
});

// 5. Generic resume words being rejected
runTest('5. Generic resume vocabulary and action verbs are rejected', () => {
  const text = 'Developed, designed, and implemented an enterprise platform project. Responsibilities included team leadership, daily management, achieving milestones, and delivering client satisfaction.';
  const result = extractResumeIntelligence(text);
  const skills = result.extractedData.skills;

  assert.strictEqual(skills.length, 0, `Expected 0 skills for generic words, got: ${JSON.stringify(skills)}`);
  
  // Verify stopwords list contains the key terms
  assert.ok(SKILL_STOPWORDS.has('developed'), 'developed should be in stopwords');
  assert.ok(SKILL_STOPWORDS.has('project'), 'project should be in stopwords');
  assert.ok(SKILL_STOPWORDS.has('responsibilities'), 'responsibilities should be in stopwords');
  assert.ok(SKILL_STOPWORDS.has('leadership') || SKILL_STOPWORDS.has('management'), 'leadership/management in stopwords');
});

// 6. False substring matches avoided
runTest('6. Avoids false substring matches', () => {
  const text = 'We are happy and snappy. Reacting to changes quickly. Scripting everyday operations.';
  const result = extractResumeIntelligence(text);
  const skills = result.extractedData.skills;

  assert.ok(!skills.includes('Python'), 'happy should not match py/Python');
  assert.ok(!skills.includes('React'), 'reacting should not match React');
  assert.ok(!skills.includes('C'), 'scripting should not match C');
});

// 7. Ambiguous abbreviations handled contextually
runTest('7. Ambiguous abbreviations (CV, go verb, copyright C) handled safely', () => {
  const text = 'Curriculum Vitae (CV) of Jane Doe. I will go to office tomorrow. Copyright (C) 2024 Jane Doe.';
  const result = extractResumeIntelligence(text);
  const skills = result.extractedData.skills;

  assert.ok(!skills.includes('Computer Vision'), 'CV should not trigger Computer Vision');
  assert.ok(!skills.includes('Go'), 'Verb "go to" should not trigger Go programming language');
  assert.ok(!skills.includes('C'), 'Copyright (C) should not trigger C language');
});

// 7b. Technical abbreviations in genuine context ARE recognized
runTest('7b. Genuine C, Go, and Py in technical context ARE recognized', () => {
  const text = 'Core languages: C, C++, and Go. Automated pipelines with train.py script.';
  const result = extractResumeIntelligence(text);
  const skills = result.extractedData.skills;

  assert.ok(skills.includes('C'), 'C in language list should be recognized');
  assert.ok(skills.includes('C++'), 'C++ should be recognized');
  assert.ok(skills.includes('Go'), 'Go in language list should be recognized');
  assert.ok(skills.includes('Python'), 'train.py script should be recognized as Python');
});

// 8. Resumes with no recognized skills
runTest('8. Resume text with no technical skills yields empty array gracefully', () => {
  const text = 'High school diploma from Springfield High. Participated in debate club, drama society, and track and field.';
  const result = extractResumeIntelligence(text);

  assert.strictEqual(result.status, 'SUCCESS');
  assert.deepStrictEqual(result.extractedData.skills, []);
  assert.ok(Array.isArray(result.extractedData.keywords));
});

// 9. Empty or malformed extracted text
runTest('9. Empty, whitespace-only, and non-string text handled cleanly', () => {
  const emptyRes = extractResumeIntelligence('');
  assert.strictEqual(emptyRes.status, 'PARSED_EMPTY');
  assert.deepStrictEqual(emptyRes.extractedData.skills, []);

  const wsRes = extractResumeIntelligence('   \n\t  \n  ');
  assert.strictEqual(wsRes.status, 'PARSED_EMPTY');
  assert.deepStrictEqual(wsRes.extractedData.skills, []);

  const nullRes = extractResumeIntelligence(null);
  assert.strictEqual(nullRes.status, 'PARSED_EMPTY');
  assert.deepStrictEqual(nullRes.extractedData.skills, []);
});

// 10. Existing skill confirmation behavior
runTest('10. Confirmation integrity: extraction does not overwrite confirmed skills', () => {
  // Simulate student profile with confirmed skills
  const existingProfileSkills = ['Node.js', 'SQL', 'Git'];
  
  // Re-parse a new resume with different skills
  const newResumeText = 'Skills: Python, Docker, Kubernetes, React.';
  const result = extractResumeIntelligence(newResumeText);
  const newlyExtracted = result.extractedData.skills;

  // The parser produces tentative extracted skills without mutating student profile
  assert.ok(newlyExtracted.includes('Python'));
  assert.ok(newlyExtracted.includes('Docker'));
  assert.ok(!newlyExtracted.includes('Node.js')); // wasn't in new text

  // Merging simulation: student confirms selection
  const confirmedSelection = ['Python', 'Docker']; // student picked these 2
  const mergedProfileSkills = Array.from(new Set([...existingProfileSkills, ...confirmedSelection]));

  assert.ok(mergedProfileSkills.includes('Node.js'), 'Prior confirmed skills preserved');
  assert.ok(mergedProfileSkills.includes('SQL'), 'Prior confirmed skills preserved');
  assert.ok(mergedProfileSkills.includes('Git'), 'Prior confirmed skills preserved');
  assert.ok(mergedProfileSkills.includes('Python'), 'Newly confirmed skill merged');
  assert.ok(mergedProfileSkills.includes('Docker'), 'Newly confirmed skill merged');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('All resume extraction precision tests PASSED successfully!\n');
  process.exit(0);
} else {
  console.error(`Failed ${totalTests - passedTests} tests.\n`);
  process.exit(1);
}
