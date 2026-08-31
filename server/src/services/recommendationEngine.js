/**
 * Rule-Based Recommendation Engine for EduConnect
 * 
 * Design Principles:
 * 1. Hard Eligibility Filters: Department, Year of Study, CGPA.
 * 2. Soft Interest-Weighted Ranking: Skills overlap (50%), Interest & Category alignment (35%), Academic Merit (15%).
 * 3. Full Explainability & Auditability: Every recommendation generates transparent reasons.
 */

function normalizeString(str) {
  return (str || '').trim().toLowerCase();
}

function evaluateOpportunity(student, opportunity) {
  const reasons = [];
  let isEligible = true;

  const studentDept = normalizeString(student.department);
  const studentYear = Number(student.year) || 1;
  const studentCGPA = Number(student.cgpa) || 0;
  const studentSkills = (student.skills || []).map(normalizeString);
  const studentInterests = (student.interests || []).map(normalizeString);

  const oppEligibility = opportunity.eligibility || {};
  const oppDepts = (oppEligibility.department || []).map(normalizeString);
  const oppMinYear = Number(oppEligibility.minYear) || 1;
  const oppMinCGPA = Number(oppEligibility.minCGPA) || 0;
  const oppSkills = (oppEligibility.skills || []).map(normalizeString);
  const oppType = normalizeString(opportunity.type);
  const oppTags = (opportunity.tags || []).map(normalizeString);

  // --- 1. HARD ELIGIBILITY FILTERS ---
  // A. Department Filter
  const isDeptOpenToAll = oppDepts.length === 0 || oppDepts.includes('all') || oppDepts.includes('any');
  const isDeptMatch = isDeptOpenToAll || (studentDept && oppDepts.includes(studentDept));

  if (isDeptMatch) {
    reasons.push(
      isDeptOpenToAll
        ? 'Department filter: Open to all academic branches'
        : `Department filter: Matches your branch (${student.department})`
    );
  } else {
    isEligible = false;
    reasons.push(
      `Ineligible (Department): Requires [${(oppEligibility.department || []).join(', ')}] (Your branch: ${student.department || 'Not set'})`
    );
  }

  // B. Year of Study Filter
  const isYearMatch = studentYear >= oppMinYear;
  if (isYearMatch) {
    reasons.push(`Year filter: Year ${studentYear} meets minimum required Year ${oppMinYear}`);
  } else {
    isEligible = false;
    reasons.push(`Ineligible (Year): Requires minimum Year ${oppMinYear} (Your year: Year ${studentYear})`);
  }

  // C. CGPA Filter
  const isCGPAMatch = studentCGPA >= oppMinCGPA;
  if (isCGPAMatch) {
    reasons.push(
      oppMinCGPA > 0
        ? `CGPA filter: CGPA ${studentCGPA.toFixed(2)} meets minimum cutoff of ${oppMinCGPA.toFixed(2)}`
        : `CGPA filter: No minimum cutoff required`
    );
  } else {
    isEligible = false;
    reasons.push(
      `Ineligible (CGPA): Requires minimum CGPA ${oppMinCGPA.toFixed(2)} (Your CGPA: ${studentCGPA.toFixed(2)})`
    );
  }

  // --- 2. SOFT RANKING METRICS ---
  // A. Skills Match (Weight: 50%)
  let skillScore = 0;
  const matchedSkills = [];
  const missingSkills = [];

  if (oppSkills.length === 0) {
    // Open skill requirements
    skillScore = 40;
    reasons.push('Skills: General entry, no prerequisite skills required');
  } else {
    oppSkills.forEach((reqSkill) => {
      const found = studentSkills.some(s => s === reqSkill || reqSkill.includes(s) || s.includes(reqSkill));
      if (found) {
        matchedSkills.push(reqSkill);
      } else {
        missingSkills.push(reqSkill);
      }
    });

    const skillRatio = matchedSkills.length / oppSkills.length;
    skillScore = Math.round(skillRatio * 50);

    if (matchedSkills.length > 0) {
      reasons.push(`Skill match (${matchedSkills.length}/${oppSkills.length}): You have ${matchedSkills.join(', ')}`);
    }
    if (missingSkills.length > 0 && isEligible) {
      reasons.push(`Skill growth: Opportunity can build ${missingSkills.join(', ')}`);
    }
  }

  // B. Interests Alignment (Weight: 35%)
  let interestScore = 10; // Baseline
  const matchedInterests = [];

  // Check if student is interested in this opportunity type (e.g., 'internship', 'internships')
  const typePlural = oppType.endsWith('s') ? oppType : `${oppType}s`;
  const typeMatched = studentInterests.some(i => i.includes(oppType) || typePlural.includes(i));
  if (typeMatched) {
    interestScore += 15;
    matchedInterests.push(opportunity.type);
  }

  // Check tags and domain alignment
  oppTags.forEach(tag => {
    if (studentInterests.some(i => i.includes(tag) || tag.includes(i))) {
      if (!matchedInterests.includes(tag)) matchedInterests.push(tag);
      interestScore += 5;
    }
  });

  // Check title/desc matching student interests
  const oppContent = `${opportunity.title} ${opportunity.description}`.toLowerCase();
  studentInterests.forEach(interest => {
    if (interest && oppContent.includes(interest) && !matchedInterests.includes(interest)) {
      matchedInterests.push(interest);
      interestScore += 5;
    }
  });

  interestScore = Math.min(35, interestScore);

  if (matchedInterests.length > 0) {
    reasons.push(`Interest alignment: Matches your focus in ${matchedInterests.join(', ')}`);
  }

  // C. Academic Standing Bonus (Weight: 15%)
  const cgpaPoints = Math.round((Math.min(10, Math.max(0, studentCGPA)) / 10) * 15);
  reasons.push(`Academic weight: CGPA ${studentCGPA.toFixed(2)} adds +${cgpaPoints} merit pts`);

  // --- 3. FINAL AGGREGATE CALCULATION ---
  let totalScore;
  let eligibilityStatus;

  if (isEligible) {
    totalScore = Math.min(100, Math.max(15, skillScore + interestScore + cgpaPoints));
    eligibilityStatus = 'Eligible';
  } else {
    // Heavily penalized so ineligible opportunities never outrank eligible ones
    totalScore = Math.min(30, Math.floor((skillScore + interestScore + cgpaPoints) * 0.25));
    eligibilityStatus = 'Ineligible';
  }

  return {
    opportunityId: opportunity._id,
    opportunity,
    score: totalScore,
    matchReasons: reasons,
    eligibilityStatus
  };
}

/**
 * Generate rule-based recommendations for a student from an array of opportunities.
 */
function generateRecommendations(student, opportunities) {
  if (!opportunities || opportunities.length === 0) {
    return [];
  }

  const evaluated = opportunities.map(opp => evaluateOpportunity(student, opp));

  // Sort descending by match score, prioritizing Eligible over Ineligible
  evaluated.sort((a, b) => {
    if (a.eligibilityStatus === 'Eligible' && b.eligibilityStatus !== 'Eligible') return -1;
    if (a.eligibilityStatus !== 'Eligible' && b.eligibilityStatus === 'Eligible') return 1;
    return b.score - a.score;
  });

  return evaluated;
}

module.exports = {
  evaluateOpportunity,
  generateRecommendations
};
