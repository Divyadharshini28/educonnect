/**
 * Client Eligibility Evaluation Utility for EduConnect
 * 
 * Centralized eligibility evaluator for client components.
 */

function normalizeString(str) {
  return (str || '').trim().toLowerCase();
}

/**
 * Evaluates opportunity requirements against student profile.
 * 
 * @param {Object} student - Student profile object
 * @param {Object} opportunity - Opportunity object
 * @returns {Object} Structured eligibility evaluation
 */
export function evaluateEligibility(student = {}, opportunity = {}) {
  const checks = [];
  const missingFields = [];

  const oppEligibility = opportunity.eligibility || {};
  const oppDepts = (oppEligibility.department || []).map(normalizeString);
  const oppMinYear = Number(oppEligibility.minYear) || 1;
  const oppMinCGPA = Number(oppEligibility.minCGPA) || 0;
  const oppSkills = (oppEligibility.skills || []).map(normalizeString);

  const studentDept = normalizeString(student?.department);
  const hasStudentDept = Boolean(student?.department && student.department.trim());

  const studentYear = student?.year !== undefined && student?.year !== null ? Number(student.year) : null;
  const hasStudentYear = studentYear !== null && !isNaN(studentYear) && studentYear > 0;

  const studentCGPA = student?.cgpa !== undefined && student?.cgpa !== null ? Number(student.cgpa) : null;
  const hasStudentCGPA = studentCGPA !== null && !isNaN(studentCGPA) && studentCGPA > 0;

  const studentSkills = Array.isArray(student?.skills) ? student.skills.map(normalizeString) : [];
  const hasStudentSkills = studentSkills.length > 0;

  // 1. Department Criterion
  const isDeptOpenToAll = oppDepts.length === 0 || oppDepts.includes('all') || oppDepts.includes('any');
  if (isDeptOpenToAll) {
    checks.push({
      criterion: 'Department',
      status: 'passed',
      message: 'Open to all academic departments',
      details: 'No specific academic discipline required.'
    });
  } else if (!hasStudentDept) {
    missingFields.push('department');
    checks.push({
      criterion: 'Department',
      status: 'unknown',
      message: 'Academic department not specified in your profile',
      details: `Opportunity requires: ${(oppEligibility.department || []).join(', ')}.`
    });
  } else if (oppDepts.includes(studentDept)) {
    checks.push({
      criterion: 'Department',
      status: 'passed',
      message: `Matches your department (${student.department})`,
      details: `Your branch is in the eligible department list.`
    });
  } else {
    checks.push({
      criterion: 'Department',
      status: 'failed',
      message: `Requires: ${(oppEligibility.department || []).join(', ')}`,
      details: `Your profile department is "${student.department}".`
    });
  }

  // 2. Year of Study Criterion
  if (oppMinYear <= 1) {
    checks.push({
      criterion: 'Academic Year',
      status: 'passed',
      message: 'Open to all academic years',
      details: 'Students of any year are welcome to apply.'
    });
  } else if (!hasStudentYear) {
    missingFields.push('year');
    checks.push({
      criterion: 'Academic Year',
      status: 'unknown',
      message: 'Year of study not specified in your profile',
      details: `Opportunity requires minimum Year ${oppMinYear}.`
    });
  } else if (studentYear >= oppMinYear) {
    checks.push({
      criterion: 'Academic Year',
      status: 'passed',
      message: `Year ${studentYear} meets minimum Year ${oppMinYear}`,
      details: `Your academic standing satisfies the year requirement.`
    });
  } else {
    checks.push({
      criterion: 'Academic Year',
      status: 'failed',
      message: `Requires minimum Year ${oppMinYear}`,
      details: `Your profile year is Year ${studentYear}.`
    });
  }

  // 3. Minimum CGPA Criterion
  if (oppMinCGPA <= 0) {
    checks.push({
      criterion: 'Minimum CGPA',
      status: 'passed',
      message: 'No minimum CGPA required',
      details: 'All CGPA standing accepted.'
    });
  } else if (!hasStudentCGPA) {
    missingFields.push('cgpa');
    checks.push({
      criterion: 'Minimum CGPA',
      status: 'unknown',
      message: 'CGPA not specified in your profile',
      details: `Opportunity requires minimum CGPA ${oppMinCGPA.toFixed(2)} / 10.`
    });
  } else if (studentCGPA >= oppMinCGPA) {
    checks.push({
      criterion: 'Minimum CGPA',
      status: 'passed',
      message: `CGPA ${studentCGPA.toFixed(2)} meets cutoff of ${oppMinCGPA.toFixed(2)}`,
      details: `Your academic CGPA meets or exceeds the minimum requirement.`
    });
  } else {
    checks.push({
      criterion: 'Minimum CGPA',
      status: 'failed',
      message: `Requires minimum CGPA ${oppMinCGPA.toFixed(2)}`,
      details: `Your profile CGPA is ${studentCGPA.toFixed(2)}.`
    });
  }

  // 4. Skills Criterion
  if (oppSkills.length === 0) {
    checks.push({
      criterion: 'Skills',
      status: 'passed',
      message: 'No prerequisite skills required',
      details: 'General entry opportunity.'
    });
  } else {
    const matched = [];
    const missing = [];
    oppSkills.forEach(req => {
      const found = studentSkills.some(s => s === req || req.includes(s) || s.includes(req));
      if (found) matched.push(req);
      else missing.push(req);
    });

    if (matched.length > 0) {
      checks.push({
        criterion: 'Skills',
        status: 'passed',
        message: `Matches ${matched.length}/${oppSkills.length} required skill(s)`,
        details: `You have: ${matched.join(', ')}.${missing.length > 0 ? ` Additional skills to build: ${missing.join(', ')}.` : ''}`
      });
    } else if (!hasStudentSkills) {
      missingFields.push('skills');
      checks.push({
        criterion: 'Skills',
        status: 'unknown',
        message: 'No technical skills selected in your profile',
        details: `Opportunity recommends: ${(oppEligibility.skills || []).join(', ')}.`
      });
    } else {
      checks.push({
        criterion: 'Skills',
        status: 'failed',
        message: `Opportunity recommends: ${(oppEligibility.skills || []).join(', ')}`,
        details: `None of your listed skills (${(student?.skills || []).join(', ')}) directly match the prerequisite list.`
      });
    }
  }

  // 5. Deadline / Expiry Criterion
  if (opportunity.deadline) {
    const deadlineDate = new Date(opportunity.deadline);
    const now = new Date();
    if (!isNaN(deadlineDate.getTime()) && deadlineDate < now) {
      checks.push({
        criterion: 'Deadline',
        status: 'failed',
        message: 'Opportunity deadline has passed',
        details: `Closed on ${deadlineDate.toLocaleDateString('en-US')}.`
      });
    } else {
      checks.push({
        criterion: 'Deadline',
        status: 'passed',
        message: 'Opportunity is active and accepting applications',
        details: `Deadline: ${deadlineDate.toLocaleDateString('en-US')}.`
      });
    }
  }

  const hasFailed = checks.some(c => c.status === 'failed');
  const hasUnknowns = checks.some(c => c.status === 'unknown');

  let status;
  let eligible;
  let summaryMessage;

  if (hasFailed) {
    status = 'ineligible';
    eligible = false;
    summaryMessage = 'You may not meet all requirements for this opportunity.';
  } else if (hasUnknowns) {
    status = 'incomplete_profile';
    eligible = false;
    const missingList = [...new Set(missingFields)].join(', ');
    summaryMessage = `Complete your ${missingList} in your profile to verify eligibility.`;
  } else {
    status = 'eligible';
    eligible = true;
    summaryMessage = 'You appear eligible for this opportunity!';
  }

  return {
    eligible,
    status,
    hasUnknowns,
    hasFailed,
    summaryMessage,
    missingFields: [...new Set(missingFields)],
    checks
  };
}
