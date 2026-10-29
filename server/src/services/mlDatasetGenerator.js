/**
 * ML Dataset Generator for EduConnect Random Forest Recommendation Engine
 * 
 * Strategy & Academic Methodology:
 * 1. Label Strategy:
 *    - Positive (Label = 1): Explicit engagement actions (APPLY, BOOKMARK, Submitted Application)
 *    - Negative (Label = 0): Explicit negative action (DISMISS)
 *    - Neutral / Excluded: VIEW, CLICK (a view/click does not signify dislike)
 * 2. Strict Timeline Anti-Leakage:
 *    - For any target event at timestamp T, only interactions occurring before T
 *      are provided in `pastInteractions`.
 * 3. Fallback / Minimum Sample Safeguard:
 *    - Validates minimum dataset size (MIN_ML_TRAINING_SAMPLES).
 * 4. Generates structured JSON consumed by Python training pipeline.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Interaction = require('../models/Interaction');

const DEFAULT_EXPORT_PATH = path.resolve(__dirname, '../../ml/data/training_data.json');

/**
 * Generate training samples from existing database records.
 */
async function generateTrainingSamplesFromDB() {
  const students = await Student.find({}).lean();
  const opportunities = await Opportunity.find({}).lean();
  const applications = await Application.find({}).lean();
  const interactions = await Interaction.find({}).sort({ timestamp: 1 }).lean();

  const oppMap = new Map(opportunities.map(o => [o._id.toString(), o]));
  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

  const samples = [];
  const processedKeys = new Set();

  // 1. Process explicit interactions (APPLY, BOOKMARK, DISMISS)
  for (let i = 0; i < interactions.length; i++) {
    const it = interactions[i];
    const sId = it.studentId ? it.studentId.toString() : null;
    const oId = it.opportunityId ? it.opportunityId.toString() : null;

    if (!sId || !oId) continue;
    const student = studentMap.get(sId);
    const opp = oppMap.get(oId);
    if (!student || !opp) continue;

    let label = null;
    if (it.interactionType === 'APPLY' || it.interactionType === 'BOOKMARK') {
      label = 1;
    } else if (it.interactionType === 'DISMISS') {
      label = 0;
    }

    if (label !== null) {
      const sampleKey = `${sId}_${oId}_${it.interactionType}_${it.timestamp?.toISOString() || i}`;
      if (!processedKeys.has(sampleKey)) {
        processedKeys.add(sampleKey);

        // Anti-leakage: collect all interactions for this student strictly prior to this interaction timestamp
        const itTime = new Date(it.timestamp || Date.now()).getTime();
        const pastInteractions = interactions.filter(other => {
          const otherStudentId = other.studentId ? other.studentId.toString() : '';
          const otherTime = new Date(other.timestamp || 0).getTime();
          return otherStudentId === sId && otherTime < itTime;
        });

        samples.push({
          student,
          opportunity: opp,
          pastInteractions,
          referenceTime: it.timestamp,
          label,
          sourceEvent: it.interactionType
        });
      }
    }
  }

  // 2. Process submitted applications as positive engagement if not already captured
  for (const app of applications) {
    const sId = app.studentId ? app.studentId.toString() : null;
    const oId = app.opportunityId ? app.opportunityId.toString() : null;

    if (!sId || !oId) continue;
    const student = studentMap.get(sId);
    const opp = oppMap.get(oId);
    if (!student || !opp) continue;

    const sampleKey = `${sId}_${oId}_APP`;
    if (!processedKeys.has(sampleKey)) {
      processedKeys.add(sampleKey);

      const appTime = new Date(app.submissionDate || Date.now()).getTime();
      const pastInteractions = interactions.filter(other => {
        const otherStudentId = other.studentId ? other.studentId.toString() : '';
        const otherTime = new Date(other.timestamp || 0).getTime();
        return otherStudentId === sId && otherTime < appTime;
      });

      samples.push({
        student,
        opportunity: opp,
        pastInteractions,
        referenceTime: app.submissionDate,
        label: 1,
        sourceEvent: 'APPLICATION_SUBMISSION'
      });
    }
  }

  return samples;
}

/**
 * Generate a standard seed/benchmark dataset of diverse student-opportunity pairs
 * for consistent training and testing across environments.
 */
function generateDeterministicSeedSamples() {
  const sampleStudents = [
    {
      _id: 'std_cs_3rd_year',
      department: 'Computer Science',
      year: 3,
      cgpa: 8.8,
      skills: ['React', 'Node.js', 'MongoDB', 'JavaScript', 'Python', 'Git'],
      interests: ['Internships', 'Web Development', 'Hackathons']
    },
    {
      _id: 'std_ai_4th_year',
      department: 'Data Science',
      year: 4,
      cgpa: 9.1,
      skills: ['Python', 'Machine Learning', 'TensorFlow', 'PyTorch', 'SQL', 'NLP'],
      interests: ['Internships', 'Artificial Intelligence', 'Research']
    },
    {
      _id: 'std_it_2nd_year',
      department: 'Information Technology',
      year: 2,
      cgpa: 7.6,
      skills: ['Java', 'C++', 'Data Structures', 'Linux', 'Docker'],
      interests: ['Cloud Computing', 'Certifications', 'Internships']
    },
    {
      _id: 'std_mech_1st_year',
      department: 'Mechanical',
      year: 1,
      cgpa: 6.8,
      skills: ['AutoCAD', 'Python', 'Problem Solving'],
      interests: ['Scholarships', 'Workshops', 'Hackathons']
    },
    {
      _id: 'std_ece_3rd_year',
      department: 'Electronics & Communication',
      year: 3,
      cgpa: 8.2,
      skills: ['C', 'IoT', 'Embedded Systems', 'Python', 'AWS'],
      interests: ['Hardware', 'IoT', 'Hackathons', 'Certifications']
    },
    {
      _id: 'std_cs_low_cgpa',
      department: 'Computer Science',
      year: 2,
      cgpa: 5.9,
      skills: ['HTML', 'CSS', 'JavaScript'],
      interests: ['Web Development', 'Internships']
    }
  ];

  const sampleOpps = [
    {
      _id: 'opp_fullstack_intern',
      title: 'Full-Stack Web Engineering Intern',
      type: 'internship',
      organization: 'TechSprint Labs',
      description: 'Build responsive web apps with React, Express, and MongoDB. Fast-paced modern engineering team.',
      eligibility: {
        department: ['Computer Science', 'Information Technology'],
        minYear: 2,
        minCGPA: 7.0,
        skills: ['React', 'Node.js', 'MongoDB']
      },
      deadline: new Date(Date.now() + 20 * 86400000).toISOString(),
      tags: ['web development', 'internship', 'react']
    },
    {
      _id: 'opp_ai_research_intern',
      title: 'Machine Learning and NLP Research Intern',
      type: 'internship',
      organization: 'DeepVision AI',
      description: 'Train transformer models and develop machine learning algorithms for recommendation systems.',
      eligibility: {
        department: ['Computer Science', 'Data Science', 'Information Technology'],
        minYear: 3,
        minCGPA: 8.0,
        skills: ['Python', 'Machine Learning', 'TensorFlow']
      },
      deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      tags: ['ai', 'machine learning', 'data science']
    },
    {
      _id: 'opp_devops_cloud',
      title: 'AWS Cloud Systems & DevOps Fellowship',
      type: 'certification',
      organization: 'CloudScale',
      description: 'Cloud deployment, Docker containerization, and AWS architecture certification track.',
      eligibility: {
        department: ['Computer Science', 'Information Technology', 'Electronics & Communication'],
        minYear: 2,
        minCGPA: 7.0,
        skills: ['Linux', 'Docker', 'AWS']
      },
      deadline: new Date(Date.now() + 45 * 86400000).toISOString(),
      tags: ['cloud', 'aws', 'devops']
    },
    {
      _id: 'opp_national_scholarship',
      title: 'National Merit STEM Undergraduate Scholarship',
      type: 'scholarship',
      organization: 'Ministry of Education',
      description: 'Annual scholarship grant awarded to top performing students across all departments.',
      eligibility: {
        department: ['All'],
        minYear: 1,
        minCGPA: 7.5,
        skills: []
      },
      deadline: new Date(Date.now() + 15 * 86400000).toISOString(),
      tags: ['scholarship', 'merit', 'financial aid']
    },
    {
      _id: 'opp_smart_hackathon',
      title: 'Smart City Innovation Hackathon 2026',
      type: 'hackathon',
      organization: 'Unstop & Government Nodal Agency',
      description: '36-hour sprint creating IoT, AI, and smart transportation prototypes.',
      eligibility: {
        department: ['All'],
        minYear: 1,
        minCGPA: 6.0,
        skills: ['Problem Solving', 'Team Collaboration']
      },
      deadline: new Date(Date.now() + 10 * 86400000).toISOString(),
      tags: ['hackathon', 'iot', 'innovation']
    },
    {
      _id: 'opp_high_honor_scholarship',
      title: 'Elite Postgraduate Research Fellowship',
      type: 'scholarship',
      organization: 'Global Research Council',
      description: 'High cutoff research scholarship for top 1% academic merit.',
      eligibility: {
        department: ['Computer Science', 'Data Science'],
        minYear: 4,
        minCGPA: 9.5,
        skills: ['Python', 'Research']
      },
      deadline: new Date(Date.now() + 60 * 86400000).toISOString(),
      tags: ['scholarship', 'fellowship']
    }
  ];

  // Defined interaction scenarios matching the label strategy:
  // - High match + Bookmarked/Applied -> Label 1
  // - Ineligible or Mismatched + Dismissed -> Label 0
  const scenarios = [
    // 1. CS 3rd year applied to FullStack Intern (Positive)
    { studentIdx: 0, oppIdx: 0, pastInteractions: [{ opportunityId: 'opp_fullstack_intern', interactionType: 'VIEW', timestamp: new Date(Date.now() - 3600000).toISOString() }], label: 1, sourceEvent: 'APPLY' },
    // 2. CS 3rd year bookmarked Smart Hackathon (Positive)
    { studentIdx: 0, oppIdx: 4, pastInteractions: [], label: 1, sourceEvent: 'BOOKMARK' },
    // 3. CS 3rd year dismissed Elite Research Fellowship (Negative, CGPA cutoff too high)
    { studentIdx: 0, oppIdx: 5, pastInteractions: [], label: 0, sourceEvent: 'DISMISS' },
    // 4. AI 4th year applied to AI Research Intern (Positive)
    { studentIdx: 1, oppIdx: 1, pastInteractions: [{ opportunityId: 'opp_ai_research_intern', interactionType: 'BOOKMARK', timestamp: new Date(Date.now() - 7200000).toISOString() }], label: 1, sourceEvent: 'APPLY' },
    // 5. AI 4th year bookmarked National Scholarship (Positive)
    { studentIdx: 1, oppIdx: 3, pastInteractions: [], label: 1, sourceEvent: 'BOOKMARK' },
    // 6. AI 4th year dismissed FullStack Intern (Negative, focus is on AI/Research)
    { studentIdx: 1, oppIdx: 0, pastInteractions: [], label: 0, sourceEvent: 'DISMISS' },
    // 7. IT 2nd year bookmarked DevOps Cloud (Positive)
    { studentIdx: 2, oppIdx: 2, pastInteractions: [], label: 1, sourceEvent: 'BOOKMARK' },
    // 8. IT 2nd year applied to National Scholarship (Positive)
    { studentIdx: 2, oppIdx: 3, pastInteractions: [], label: 1, sourceEvent: 'APPLY' },
    // 9. IT 2nd year dismissed AI Research (Negative, requires Year 3 and CGPA 8.0)
    { studentIdx: 2, oppIdx: 1, pastInteractions: [], label: 0, sourceEvent: 'DISMISS' },
    // 10. Mech 1st year applied to Smart Hackathon (Positive)
    { studentIdx: 3, oppIdx: 4, pastInteractions: [], label: 1, sourceEvent: 'APPLY' },
    // 11. Mech 1st year dismissed AI Research (Negative, ineligible dept and year)
    { studentIdx: 3, oppIdx: 1, pastInteractions: [], label: 0, sourceEvent: 'DISMISS' },
    // 12. Mech 1st year dismissed Fullstack Intern (Negative, ineligible dept and year)
    { studentIdx: 3, oppIdx: 0, pastInteractions: [], label: 0, sourceEvent: 'DISMISS' },
    // 13. ECE 3rd year applied to Smart Hackathon (Positive)
    { studentIdx: 4, oppIdx: 4, pastInteractions: [{ opportunityId: 'opp_smart_hackathon', interactionType: 'VIEW', timestamp: new Date(Date.now() - 5000000).toISOString() }], label: 1, sourceEvent: 'APPLY' },
    // 14. ECE 3rd year bookmarked DevOps Cloud (Positive)
    { studentIdx: 4, oppIdx: 2, pastInteractions: [], label: 1, sourceEvent: 'BOOKMARK' },
    // 15. ECE 3rd year dismissed Fullstack Intern (Negative)
    { studentIdx: 4, oppIdx: 0, pastInteractions: [], label: 0, sourceEvent: 'DISMISS' },
    // 16. CS Low CGPA dismissed National Scholarship (Negative, cutoff not met)
    { studentIdx: 5, oppIdx: 3, pastInteractions: [], label: 0, sourceEvent: 'DISMISS' },
    // 17. CS Low CGPA dismissed Elite Fellowship (Negative, cutoff not met)
    { studentIdx: 5, oppIdx: 5, pastInteractions: [], label: 0, sourceEvent: 'DISMISS' },
    // 18. CS Low CGPA applied to Smart Hackathon (Positive, minCGPA 6.0)
    { studentIdx: 5, oppIdx: 4, pastInteractions: [], label: 1, sourceEvent: 'APPLY' }
  ];

  return scenarios.map(sc => ({
    student: sampleStudents[sc.studentIdx],
    opportunity: sampleOpps[sc.oppIdx],
    pastInteractions: sc.pastInteractions || [],
    referenceTime: new Date().toISOString(),
    label: sc.label,
    sourceEvent: sc.sourceEvent
  }));
}

/**
 * Export unified training dataset to file.
 */
async function exportTrainingDataset(outputPath = DEFAULT_EXPORT_PATH, options = {}) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let samples = [];
  try {
    samples = await generateTrainingSamplesFromDB();
  } catch (err) {
    console.warn('[ML Dataset] Could not extract samples from MongoDB:', err.message);
  }

  // If DB samples are fewer than required threshold and fallback seed is allowed, supplement with seed samples
  if (samples.length < 10 || options.includeSeed) {
    const seedSamples = generateDeterministicSeedSamples();
    // Merge without duplicating student-opportunity combinations
    const existingPairs = new Set(samples.map(s => `${s.student._id || s.student.id}_${s.opportunity._id || s.opportunity.id}`));
    for (const seed of seedSamples) {
      const pair = `${seed.student._id}_${seed.opportunity._id}`;
      if (!existingPairs.has(pair)) {
        samples.push(seed);
        existingPairs.add(pair);
      }
    }
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    totalSamples: samples.length,
    positiveSamples: samples.filter(s => s.label === 1).length,
    negativeSamples: samples.filter(s => s.label === 0).length,
    samples
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[ML Dataset] Successfully wrote ${samples.length} training samples to ${outputPath}`);
  return payload;
}

module.exports = {
  generateTrainingSamplesFromDB,
  generateDeterministicSeedSamples,
  exportTrainingDataset,
  DEFAULT_EXPORT_PATH
};
