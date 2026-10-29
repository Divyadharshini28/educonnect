/**
 * Opportunity Normalization and Validation Utility
 * 
 * Standardizes heterogeneous external opportunity payloads from Hopin
 * (Internships, Jobs, Events) into the canonical EduConnect Opportunity structure.
 */

const COMMON_TECH_SKILLS = [
  'React', 'Node.js', 'Express', 'MongoDB', 'JavaScript', 'TypeScript',
  'Python', 'Java', 'C++', 'C#', 'SQL', 'PostgreSQL', 'Docker', 'AWS',
  'Kubernetes', 'Machine Learning', 'Data Science', 'TensorFlow', 'PyTorch',
  'HTML', 'CSS', 'Tailwind', 'Git', 'Linux', 'REST API', 'GraphQL'
];

/**
 * Extract matched technical skills from text content
 */
function extractSkillsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const lowerText = text.toLowerCase();
  const matched = [];

  for (const skill of COMMON_TECH_SKILLS) {
    const lowerSkill = skill.toLowerCase();
    const regex = new RegExp(`\\b${lowerSkill.replace(/[.+]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerText) || lowerText.includes(lowerSkill)) {
      matched.push(skill);
    }
  }

  return Array.from(new Set(matched));
}

/**
 * Map external work types into canonical mode
 */
function normalizeWorkMode(workType) {
  if (!workType) return 'ONLINE';
  const wt = String(workType).trim().toLowerCase();
  if (wt.includes('remote') || wt.includes('online') || wt.includes('virtual')) {
    return 'ONLINE';
  }
  if (wt.includes('hybrid')) {
    return 'HYBRID';
  }
  if (wt.includes('on-site') || wt.includes('onsite') || wt.includes('in-person') || wt.includes('offline')) {
    return 'OFFLINE';
  }
  return 'ONLINE';
}

/**
 * Infer relevant academic departments from industry/role metadata
 */
function inferDepartments(industry, roleType, title) {
  const combined = `${industry || ''} ${roleType || ''} ${title || ''}`.toLowerCase();
  
  if (
    combined.includes('software') ||
    combined.includes('technology') ||
    combined.includes('computer') ||
    combined.includes('it') ||
    combined.includes('web') ||
    combined.includes('data') ||
    combined.includes('ai')
  ) {
    return ['Computer Science', 'Information Technology'];
  }

  if (combined.includes('electronics') || combined.includes('embedded') || combined.includes('vlsi')) {
    return ['Electronics & Communication', 'Computer Science'];
  }

  if (combined.includes('mechanical') || combined.includes('manufacturing')) {
    return ['Mechanical'];
  }

  if (combined.includes('civil') || combined.includes('construction')) {
    return ['Civil'];
  }

  return ['All'];
}

/**
 * Classify Hopin event into canonical opportunity type
 * 
 * Classification Rules:
 * - 'hackathon' in event_type or title -> 'HACKATHON'
 * - 'competition', 'contest', 'challenge', 'case comp' in event_type or title -> 'COMPETITION'
 * - 'workshop', 'session', 'bootcamp', 'seminar', 'drive' in event_type or title -> 'WORKSHOP'
 * - Default generic fallback -> 'WORKSHOP'
 */
function classifyHopinEventType(eventType, title) {
  const combined = `${eventType || ''} ${title || ''}`.toLowerCase();
  if (combined.includes('hackathon')) {
    return 'HACKATHON';
  }
  if (combined.includes('competition') || combined.includes('contest') || combined.includes('challenge') || combined.includes('case comp')) {
    return 'COMPETITION';
  }
  if (combined.includes('workshop') || combined.includes('bootcamp') || combined.includes('session') || combined.includes('seminar') || combined.includes('drive')) {
    return 'WORKSHOP';
  }
  return 'WORKSHOP';
}

/**
 * Calculate opportunity active/closing_soon/expired status
 */
function computeOpportunityStatus(deadline, isActive = true) {
  if (isActive === false) return 'EXPIRED';
  if (!deadline) return 'ACTIVE';

  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) return 'ACTIVE';

  const now = new Date();
  if (deadlineDate < now) return 'EXPIRED';

  const msRemaining = deadlineDate.getTime() - now.getTime();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  if (msRemaining <= threeDaysMs) return 'CLOSING_SOON';
  return 'ACTIVE';
}

/**
 * Validate that a normalized opportunity satisfies canonical schema constraints
 */
function validateNormalizedOpportunity(opp) {
  const errors = [];

  if (!opp) {
    return { isValid: false, errors: ['Opportunity object is null or undefined'] };
  }

  if (!opp.externalId || typeof opp.externalId !== 'string' || opp.externalId.trim() === '') {
    errors.push('externalId is required and must be a non-empty string');
  }

  if (!opp.source || typeof opp.source !== 'string' || opp.source.trim() === '') {
    errors.push('source is required and must be a non-empty string');
  }

  if (!opp.title || typeof opp.title !== 'string' || opp.title.trim() === '') {
    errors.push('title is required and must be a non-empty string');
  }

  if (!opp.type || typeof opp.type !== 'string' || opp.type.trim() === '') {
    errors.push('type is required');
  }

  // If a deadline is provided, it must be a valid date
  if (opp.deadline !== null && opp.deadline !== undefined && isNaN(new Date(opp.deadline).getTime())) {
    errors.push('deadline must be a valid date when provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Safely extract external applicant stats if provided by source
 */
function extractExternalApplicantStats(raw = {}, sourceName = 'external') {
  const rawCount = raw.applicant_count ?? raw.applicants_count ?? raw.applicants ?? raw.externalApplicantCount ?? raw.applicantCount ?? raw.attendees_count ?? raw.current_attendees ?? raw.registrations_count;
  let applicantCount = null;
  if (rawCount !== undefined && rawCount !== null && rawCount !== '' && !isNaN(Number(rawCount)) && typeof rawCount !== 'boolean') {
    applicantCount = Math.max(0, parseInt(rawCount, 10));
  }
  return {
    externalApplicantCount: applicantCount,
    externalStats: {
      source: sourceName,
      applicantCount,
      lastVerifiedAt: applicantCount !== null ? (raw.fetchedAt ? new Date(raw.fetchedAt) : new Date()) : null
    }
  };
}

/**
 * Normalize a single Hopin internship item into the canonical Opportunity structure
 */
function normalizeHopinInternship(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Hopin item must be an object');
  }

  const externalId = String(raw.id || '').trim();
  const title = (raw.title || '').trim();
  const organization = (raw.company || 'Hopin Partner').trim();
  const description = (raw.description || `${title} internship at ${organization}`).trim();

  const mode = normalizeWorkMode(raw.work_type);
  const location = (raw.location || (mode === 'ONLINE' ? 'Remote' : 'India')).trim();

  const department = inferDepartments(raw.industry, raw.role_type, title);
  const contentForSkills = `${title} ${description} ${raw.role_type || ''} ${raw.industry || ''}`;
  const skills = extractSkillsFromText(contentForSkills);

  const postedDate = raw.posted_at && !isNaN(new Date(raw.posted_at).getTime())
    ? new Date(raw.posted_at)
    : new Date();

  // Deadline: strictly from source. Do NOT invent a deadline if missing.
  const deadline = raw.deadline && !isNaN(new Date(raw.deadline).getTime())
    ? new Date(raw.deadline)
    : null;

  const startDate = raw.start_date && !isNaN(new Date(raw.start_date).getTime())
    ? new Date(raw.start_date)
    : null;

  const status = computeOpportunityStatus(deadline, raw.is_active !== false);

  const sourceUrl = raw.url || (externalId ? `https://hopinjobs.com/internships/${externalId}` : 'https://hopinjobs.com');
  const applicationUrl = raw.apply_url || sourceUrl;

  const stipend = (raw.stipend || '').trim();
  const stipendOrReward = stipend || '';
  
  // Fee: only populate if source explicitly indicates one, otherwise null
  const fee = raw.fee !== undefined && raw.fee !== null ? String(raw.fee).trim() : null;

  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'hopin');

  const tags = Array.from(new Set(
    [
      'internship',
      'hopin',
      raw.industry,
      raw.role_type,
      raw.work_type,
      ...skills.slice(0, 5)
    ]
      .filter(t => t && typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())
  ));

  return {
    externalId,
    source: 'hopin',
    type: 'INTERNSHIP',
    title,
    organization,
    description,
    eligibility: {
      department,
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

/**
 * Normalize a single Hopin job item into the canonical Opportunity structure
 */
function normalizeHopinJob(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Hopin item must be an object');
  }

  const externalId = String(raw.id || '').trim();
  const title = (raw.title || '').trim();
  const organization = (raw.company || 'Hopin Partner').trim();
  const description = (raw.description || `${title} placement opportunity at ${organization}`).trim();

  const mode = normalizeWorkMode(raw.work_type);
  const location = (raw.location || (mode === 'ONLINE' ? 'Remote' : 'India')).trim();

  const department = inferDepartments(raw.industry, raw.role_type, title);
  const contentForSkills = `${title} ${description} ${raw.role_type || ''} ${raw.industry || ''}`;
  const skills = extractSkillsFromText(contentForSkills);

  const postedDate = raw.posted_at && !isNaN(new Date(raw.posted_at).getTime())
    ? new Date(raw.posted_at)
    : new Date();

  // Deadline: strictly from source. Do NOT invent a deadline if missing.
  const deadline = raw.deadline && !isNaN(new Date(raw.deadline).getTime())
    ? new Date(raw.deadline)
    : null;

  const startDate = raw.start_date && !isNaN(new Date(raw.start_date).getTime())
    ? new Date(raw.start_date)
    : null;

  const status = computeOpportunityStatus(deadline, raw.is_active !== false);

  const sourceUrl = raw.url || (externalId ? `https://hopinjobs.com/jobs/${externalId}` : 'https://hopinjobs.com');
  const applicationUrl = raw.apply_url || sourceUrl;

  const stipend = (raw.ctc_amount || raw.salary || '').trim();
  const stipendOrReward = stipend || '';

  // Fee: only populate if source explicitly indicates one, otherwise null
  const fee = raw.fee !== undefined && raw.fee !== null ? String(raw.fee).trim() : null;

  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'hopin');

  const tags = Array.from(new Set(
    [
      'placement',
      'job',
      'hopin',
      raw.industry,
      raw.role_type,
      raw.work_type,
      ...skills.slice(0, 5)
    ]
      .filter(t => t && typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())
  ));

  return {
    externalId,
    source: 'hopin',
    type: 'PLACEMENT',
    title,
    organization,
    description,
    eligibility: {
      department,
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

/**
 * Normalize a single Hopin event item into the canonical Opportunity structure
 */
function normalizeHopinEvent(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Hopin item must be an object');
  }

  const externalId = String(raw.id || '').trim();
  const title = (raw.title || '').trim();
  const organization = (raw.company || 'Hopin Partner').trim();
  const description = (raw.description || `${title} organized by ${organization}`).trim();

  // Classify event into canonical type (WORKSHOP, HACKATHON, COMPETITION)
  const canonicalType = classifyHopinEventType(raw.event_type, title);

  // Work Mode: check is_online boolean
  let mode = 'ONLINE';
  if (raw.is_online === true) {
    mode = 'ONLINE';
  } else if (raw.is_online === false) {
    mode = 'OFFLINE';
  } else if (raw.location) {
    mode = normalizeWorkMode(raw.location);
  }

  const location = (raw.location || (mode === 'ONLINE' ? 'Online' : 'Campus Venue')).trim();

  // Dates: Hopin provides event_date (e.g. '2026-01-20')
  const startDate = raw.event_date && !isNaN(new Date(raw.event_date).getTime())
    ? new Date(raw.event_date)
    : null;

  // Deadline: strictly from source. Do NOT invent a deadline if missing.
  const deadline = raw.deadline && !isNaN(new Date(raw.deadline).getTime())
    ? new Date(raw.deadline)
    : null;

  const postedDate = raw.created_at && !isNaN(new Date(raw.created_at).getTime())
    ? new Date(raw.created_at)
    : new Date();

  // Status: if event is in the past, or is_active is false, mark EXPIRED
  let status = 'ACTIVE';
  if (raw.is_active === false) {
    status = 'EXPIRED';
  } else if (startDate && startDate < new Date()) {
    status = 'EXPIRED';
  } else if (deadline) {
    status = computeOpportunityStatus(deadline, true);
  }

  const sourceUrl = raw.url || (externalId ? `https://hopinjobs.com/events/${externalId}` : 'https://hopinjobs.com/events');
  const applicationUrl = raw.apply_url || sourceUrl;

  const stipend = '';
  const stipendOrReward = '';

  // Fee: only populate if source explicitly indicates one, otherwise null
  const fee = raw.fee !== undefined && raw.fee !== null ? String(raw.fee).trim() : null;

  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'hopin');

  const contentForSkills = `${title} ${description} ${raw.event_type || ''}`;
  const skills = extractSkillsFromText(contentForSkills);

  const tags = Array.from(new Set(
    [
      canonicalType,
      'hopin',
      'event',
      raw.event_type,
      ...skills.slice(0, 5)
    ]
      .filter(t => t && typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())
  ));

  return {
    externalId,
    source: 'hopin',
    type: canonicalType,
    title,
    organization,
    description,
    eligibility: {
      department: ['All'],
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

/**
 * Classify a Brabble listing into canonical opportunity type
 * 
 * Classification Rules:
 * - If raw.type or raw.kind or title contains 'hackathon' -> 'HACKATHON'
 * - If raw.type or raw.kind or title contains 'competition', 'contest', 'challenge', 'case comp', 'quiz' -> 'COMPETITION'
 * - If raw.hub === 'hackathons' -> 'HACKATHON'
 * - If raw.hub === 'competitions' -> 'COMPETITION'
 * - Default -> 'HACKATHON'
 */
function classifyBrabbleListingType(raw = {}) {
  const combined = `${raw.type || ''} ${raw.kind || ''} ${raw.title || ''} ${raw.hub || ''}`.toLowerCase();
  if (combined.includes('hackathon')) {
    return 'HACKATHON';
  }
  if (
    combined.includes('competition') ||
    combined.includes('contest') ||
    combined.includes('challenge') ||
    combined.includes('case comp') ||
    combined.includes('quiz')
  ) {
    return 'COMPETITION';
  }
  return 'HACKATHON';
}

/**
 * Normalize a single Brabble listing item into the canonical Opportunity structure
 */
function normalizeBrabbleListing(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Brabble listing must be an object');
  }

  const externalId = String(raw.id || raw.externalId || '').trim();
  const title = (raw.title || '').trim();
  const organization = (raw.organiser || raw.organizer || (raw.platform ? `Via ${raw.platform}` : 'Brabble Partner')).trim();
  const platform = raw.platform ? String(raw.platform).trim() : '';

  const canonicalType = classifyBrabbleListingType(raw);

  // Build clean description if not explicitly provided
  let description = (raw.description || '').trim();
  if (!description) {
    const descParts = [`${title} - ${raw.kind || canonicalType.toLowerCase()} hosted by ${organization}.`];
    if (platform) descParts.push(`Listed via ${platform}.`);
    if (raw.team) descParts.push(`Team Size: ${raw.team}.`);
    if (raw.eligibility && (Array.isArray(raw.eligibility) ? raw.eligibility.length > 0 : String(raw.eligibility).trim().length > 0)) {
      const eligStr = Array.isArray(raw.eligibility) ? raw.eligibility.join(', ') : String(raw.eligibility);
      descParts.push(`Eligibility: ${eligStr}.`);
    }
    description = descParts.join(' ');
  }

  // Work Mode: check raw.mode
  const mode = normalizeWorkMode(raw.mode);
  const location = (
    raw.city
      ? (mode === 'ONLINE' ? `${raw.city} (Online)` : raw.city)
      : (mode === 'ONLINE' ? 'Online' : 'India')
  ).trim();

  // Dates: deadline strictly from source. Do NOT invent if missing.
  const deadline = raw.deadline && !isNaN(new Date(raw.deadline).getTime())
    ? new Date(raw.deadline)
    : null;

  const startDate = raw.startDate && !isNaN(new Date(raw.startDate).getTime())
    ? new Date(raw.startDate)
    : null;

  const postedDate = raw.refreshedAt && !isNaN(new Date(raw.refreshedAt).getTime())
    ? new Date(raw.refreshedAt)
    : (raw.createdAt && !isNaN(new Date(raw.createdAt).getTime()) ? new Date(raw.createdAt) : new Date());

  // Status
  let status = 'ACTIVE';
  if (raw.isActive === false) {
    status = 'EXPIRED';
  } else if (deadline) {
    status = computeOpportunityStatus(deadline, true);
  }

  // URLs
  const sourceUrl = raw.shareUrl || raw.url || (externalId ? `https://brabble.ai/listing/${externalId}` : 'https://brabble.ai');
  const applicationUrl = raw.url || raw.shareUrl || sourceUrl;

  // Reward / Prize / Stipend
  let stipendOrReward = 'Certificate and Academic Recognition';
  let stipend = '';
  if (raw.prize) {
    if (raw.prize.inr !== undefined && raw.prize.inr !== null && !isNaN(Number(raw.prize.inr))) {
      stipendOrReward = `₹${Number(raw.prize.inr).toLocaleString('en-IN')}`;
      stipend = stipendOrReward;
    } else if (raw.prize.label) {
      stipendOrReward = String(raw.prize.label).trim();
      stipend = stipendOrReward;
    }
  } else if (raw.stipendOrReward) {
    stipendOrReward = String(raw.stipendOrReward).trim();
    stipend = stipendOrReward;
  }

  // Fee: strictly preserve null if absent
  const fee = raw.fee !== undefined && raw.fee !== null ? String(raw.fee).trim() : null;

  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'brabble');

  // Extract skills from title, description, platform, tags, and eligibility text
  const eligText = Array.isArray(raw.eligibility) ? raw.eligibility.join(' ') : (raw.eligibility || '');
  const tagsText = Array.isArray(raw.tags) ? raw.tags.join(' ') : '';
  const contentForSkills = `${title} ${description} ${platform} ${eligText} ${tagsText}`;
  const skills = extractSkillsFromText(contentForSkills);

  // Departments
  const departments = inferDepartments(platform, raw.kind || '', `${title} ${eligText}`);

  const tags = Array.from(new Set(
    [
      canonicalType,
      'brabble',
      platform,
      mode,
      ...skills.slice(0, 5)
    ]
      .filter(t => t && typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())
  ));

  return {
    externalId,
    source: 'brabble',
    type: canonicalType,
    title,
    organization,
    description,
    eligibility: {
      department: departments,
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

/**
 * Classify a BodhDisha listing into canonical opportunity type
 * 
 * Classification Rules:
 * - If explicitly indicated or if title/category/level has 'scholarship' -> 'SCHOLARSHIP'
 * - If explicitly indicated or if title/category/program has 'course' or 'coaching' or 'program' -> 'COURSE'
 * - Default -> 'COURSE'
 */
function classifyBodhDishaListingType(raw = {}) {
  const combined = `${raw.type || ''} ${raw.category || ''} ${raw.name || ''} ${raw.title || ''} ${raw.program || ''}`.toLowerCase();
  if (combined.includes('scholarship')) {
    return 'SCHOLARSHIP';
  }
  return 'COURSE';
}

/**
 * Normalize a single BodhDisha scholarship item into the canonical Opportunity structure
 */
function normalizeBodhDishaScholarship(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw BodhDisha scholarship must be an object');
  }

  const externalId = String(raw.id !== undefined && raw.id !== null ? raw.id : (raw.externalId || '')).trim();
  const title = (raw.name || raw.title || '').trim();
  const organization = (raw.provider || raw.organization || raw.institution || 'BodhDisha Education Partner').trim();

  // Description: preserve source or build cleanly without fabricating unverified details
  let description = (raw.description || '').trim();
  if (!description) {
    const descParts = [`${title} provided by ${organization}.`];
    if (raw.education_level) descParts.push(`Level: ${raw.education_level}.`);
    if (raw.state) descParts.push(`Region: ${raw.state}.`);
    if (raw.eligibility && (Array.isArray(raw.eligibility) ? raw.eligibility.length > 0 : String(raw.eligibility).trim().length > 0)) {
      const eligStr = Array.isArray(raw.eligibility) ? raw.eligibility.join(', ') : String(raw.eligibility);
      descParts.push(`Eligibility: ${eligStr}.`);
    }
    description = descParts.join(' ').trim();
  }

  // Work Mode: default to ONLINE for scholarship access unless location specifies otherwise
  const mode = normalizeWorkMode(raw.mode || 'ONLINE');
  const location = (raw.location || raw.city || raw.state || 'Online / Pan-India').trim();

  // Dates: strictly from source. Do NOT invent deadlines.
  const deadline = raw.deadline && !isNaN(new Date(raw.deadline).getTime())
    ? new Date(raw.deadline)
    : null;

  const startDate = raw.start_date && !isNaN(new Date(raw.start_date).getTime())
    ? new Date(raw.start_date)
    : null;

  const postedDate = raw.created_at && !isNaN(new Date(raw.created_at).getTime())
    ? new Date(raw.created_at)
    : (raw.updated_at && !isNaN(new Date(raw.updated_at).getTime()) ? new Date(raw.updated_at) : new Date());

  // Status
  let status = 'ACTIVE';
  if (raw.status === 'inactive' || raw.is_active === false) {
    status = 'EXPIRED';
  } else if (deadline) {
    status = computeOpportunityStatus(deadline, true);
  }

  // URLs
  const sourceUrl = raw.website || raw.url || raw.application_url || (externalId ? `https://bodhdisha.com/scholarships/${raw.slug || externalId}` : 'https://bodhdisha.com/scholarships');
  const applicationUrl = raw.application_url || raw.website || raw.url || sourceUrl;

  // Scholarship Amount / Reward: preserve as-is; do NOT invent an amount if missing.
  let stipend = '';
  let stipendOrReward = '';
  if (raw.amount !== undefined && raw.amount !== null && String(raw.amount).trim() !== '') {
    const numAmount = Number(raw.amount);
    if (!isNaN(numAmount) && typeof raw.amount !== 'boolean') {
      stipend = `₹${numAmount.toLocaleString('en-IN')}`;
    } else {
      stipend = String(raw.amount).trim();
    }
    stipendOrReward = stipend;
  } else if (raw.award) {
    stipend = String(raw.award).trim();
    stipendOrReward = stipend;
  }

  // Fee: only if source indicates, strictly null if absent
  const fee = raw.fee !== undefined && raw.fee !== null ? String(raw.fee).trim() : null;

  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'bodhdisha');

  // Skills and departments
  const eligText = Array.isArray(raw.eligibility) ? raw.eligibility.join(' ') : (raw.eligibility || '');
  const contentForSkills = `${title} ${description} ${raw.education_level || ''} ${eligText}`;
  const skills = extractSkillsFromText(contentForSkills);
  const departments = inferDepartments(raw.provider || '', raw.education_level || '', `${title} ${eligText}`);

  const tags = Array.from(new Set(
    [
      'scholarship',
      'bodhdisha',
      raw.education_level,
      raw.state,
      ...skills.slice(0, 5)
    ]
      .filter(t => t && typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())
  ));

  return {
    externalId,
    source: 'bodhdisha',
    type: 'SCHOLARSHIP',
    title,
    organization,
    description,
    eligibility: {
      department: departments,
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

/**
 * Normalize a single BodhDisha course item into the canonical Opportunity structure
 */
function normalizeBodhDishaCourse(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw BodhDisha course must be an object');
  }

  const externalId = String(raw.id !== undefined && raw.id !== null ? raw.id : (raw.externalId || '')).trim();
  const title = (raw.name || raw.program || raw.title || '').trim();
  const organization = (raw.provider || raw.institution || (raw.coaching_center_id ? 'Coaching Partner' : 'BodhDisha Education Partner')).trim();

  let description = (raw.description || '').trim();
  if (!description) {
    const descParts = [`${title} offered by ${organization}.`];
    if (raw.duration) descParts.push(`Duration: ${raw.duration}.`);
    if (raw.level) descParts.push(`Level: ${raw.level}.`);
    if (raw.exam_name) descParts.push(`Target Exam: ${raw.exam_name}.`);
    description = descParts.join(' ').trim();
  }

  // Work Mode: check raw.mode
  const mode = normalizeWorkMode(raw.mode || 'ONLINE');
  const location = (raw.location || (mode === 'ONLINE' ? 'Online' : 'India')).trim();

  // Dates: strictly from source. Do NOT invent deadlines.
  const deadline = raw.deadline && !isNaN(new Date(raw.deadline).getTime())
    ? new Date(raw.deadline)
    : null;

  const startDate = raw.start_date && !isNaN(new Date(raw.start_date).getTime())
    ? new Date(raw.start_date)
    : null;

  const postedDate = raw.created_at && !isNaN(new Date(raw.created_at).getTime())
    ? new Date(raw.created_at)
    : (raw.updated_at && !isNaN(new Date(raw.updated_at).getTime()) ? new Date(raw.updated_at) : new Date());

  // Status
  let status = 'ACTIVE';
  if (raw.status === 'inactive' || raw.is_active === false) {
    status = 'EXPIRED';
  } else if (deadline) {
    status = computeOpportunityStatus(deadline, true);
  }

  // URLs
  const sourceUrl = raw.website || raw.url || raw.application_url || (externalId ? `https://bodhdisha.com/courses/${raw.slug || externalId}` : 'https://bodhdisha.com/courses');
  const applicationUrl = raw.application_url || raw.website || raw.url || sourceUrl;

  // Fee: do NOT default to Free if absent. Preserve null.
  let fee = null;
  if (raw.fee !== undefined && raw.fee !== null && String(raw.fee).trim() !== '') {
    const numFee = Number(raw.fee);
    if (!isNaN(numFee) && typeof raw.fee !== 'boolean') {
      fee = `₹${numFee.toLocaleString('en-IN')}`;
    } else {
      fee = String(raw.fee).trim();
    }
  }

  // Discount / Stipend
  let stipend = '';
  let stipendOrReward = '';
  if (raw.discount !== undefined && raw.discount !== null && Number(raw.discount) > 0) {
    stipend = `Discount: ₹${Number(raw.discount).toLocaleString('en-IN')}`;
    stipendOrReward = stipend;
  }

  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'bodhdisha');

  // Skills and departments
  const contentForSkills = `${title} ${description} ${raw.level || ''} ${raw.exam_name || ''}`;
  const skills = extractSkillsFromText(contentForSkills);
  const departments = inferDepartments(organization, raw.level || '', `${title} ${description}`);

  const tags = Array.from(new Set(
    [
      'course',
      'bodhdisha',
      raw.level,
      mode,
      ...skills.slice(0, 5)
    ]
      .filter(t => t && typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())
  ));

  return {
    externalId,
    source: 'bodhdisha',
    type: 'COURSE',
    title,
    organization,
    description,
    eligibility: {
      department: departments,
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

/**
 * Strip HTML tags and entities cleanly from markup text
 */
function stripHtmlTags(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a deterministic externalId when source does not supply one directly
 */
function generateDeterministicExternalId(source, raw = {}) {
  const crypto = require('crypto');
  if (raw.id !== undefined && raw.id !== null && String(raw.id).trim() !== '') {
    return String(raw.id).trim();
  }
  if (raw.externalId !== undefined && raw.externalId !== null && String(raw.externalId).trim() !== '') {
    return String(raw.externalId).trim();
  }
  if (raw.slug !== undefined && raw.slug !== null && String(raw.slug).trim() !== '') {
    return String(raw.slug).trim();
  }

  const url = raw.url || raw.application_url || raw.applicationUrl || raw.shareUrl || raw.officialUrl || '';
  const title = raw.title || raw.name || raw.program || '';
  const org = raw.company || raw.company_name || raw.organization || raw.organiser || raw.provider || '';

  const seed = `${source}:${url.trim() || `${title.trim()}:${org.trim()}`}`;
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);
}

/**
 * Normalize a single Devpost hackathon item into the canonical Opportunity structure
 */
function normalizeDevpostHackathon(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Devpost hackathon must be an object');
  }

  const externalId = String(raw.id !== undefined && raw.id !== null ? raw.id : (raw.externalId || '')).trim() || generateDeterministicExternalId('devpost', raw);
  const title = (raw.title || '').trim();
  const organization = (raw.organization_name || 'Devpost Challenge Partner').trim();

  // Classify canonical type (HACKATHON vs COMPETITION)
  const combined = `${title} ${Array.isArray(raw.themes) ? raw.themes.map(t => t?.name || t).join(' ') : ''}`.toLowerCase();
  const canonicalType = combined.includes('competition') || combined.includes('contest') || combined.includes('challenge')
    ? 'COMPETITION'
    : 'HACKATHON';

  const mode = normalizeWorkMode(raw.displayed_location?.location || (raw.open_state === 'open' ? 'Online' : 'Offline'));
  const location = (raw.displayed_location?.location || (mode === 'ONLINE' ? 'Online / Global' : 'Campus / Venue')).trim();

  // Parse deadline: Devpost provides submission_period_dates e.g. "Aug 31 - Oct 23, 2026"
  let deadline = null;
  if (raw.deadline && !isNaN(new Date(raw.deadline).getTime())) {
    deadline = new Date(raw.deadline);
  } else if (raw.submission_period_dates && typeof raw.submission_period_dates === 'string') {
    const parts = raw.submission_period_dates.split('-');
    const endDateCandidate = parts[parts.length - 1].trim();
    const parsedCandidate = new Date(endDateCandidate);
    if (!isNaN(parsedCandidate.getTime())) {
      deadline = parsedCandidate;
    }
  }

  const postedDate = raw.created_at && !isNaN(new Date(raw.created_at).getTime())
    ? new Date(raw.created_at)
    : new Date();

  // Status
  let status = 'ACTIVE';
  if (raw.open_state === 'ended' || raw.open_state === 'closed' || raw.is_active === false) {
    status = 'EXPIRED';
  } else if (deadline) {
    status = computeOpportunityStatus(deadline, true);
  }

  // URLs
  const sourceUrl = raw.url || (externalId ? `https://devpost.com/hackathons/${externalId}` : 'https://devpost.com');
  const applicationUrl = raw.start_a_submission_url || raw.url || sourceUrl;

  // Prizes
  const cleanPrize = stripHtmlTags(raw.prize_amount || '').replace(/\$\s+/g, '$').trim();
  const stipendOrReward = cleanPrize || 'Cash Prizes & Certificates';
  const stipend = cleanPrize;
  const fee = null; // Devpost hackathons are free to enter

  // External Applicants (registrations_count is genuine from Devpost)
  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'devpost');

  // Themes and skills
  const themeNames = Array.isArray(raw.themes) ? raw.themes.map(t => (typeof t === 'string' ? t : t?.name)).filter(Boolean) : [];
  const contentForSkills = `${title} ${themeNames.join(' ')} ${raw.time_left_to_submission || ''}`;
  const skills = extractSkillsFromText(contentForSkills);
  const departments = inferDepartments(organization, themeNames.join(' '), title);

  const description = (
    raw.description ||
    `${title} organized by ${organization}. ${themeNames.length ? `Themes: ${themeNames.join(', ')}. ` : ''}${raw.submission_period_dates ? `Submission period: ${raw.submission_period_dates}.` : ''}`
  ).trim();

  const tags = Array.from(new Set([
    canonicalType,
    'devpost',
    'hackathon',
    ...themeNames.slice(0, 3),
    ...skills.slice(0, 5)
  ].filter(t => t && typeof t === 'string' && t.trim().length > 0).map(t => t.trim().toLowerCase())));

  return {
    externalId,
    source: 'devpost',
    type: canonicalType,
    title,
    organization,
    description,
    eligibility: {
      department: departments,
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate: null,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

/**
 * Normalize a single Remotive job/internship item into the canonical Opportunity structure
 */
function normalizeRemotiveJob(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Remotive job must be an object');
  }

  const externalId = String(raw.id !== undefined && raw.id !== null ? raw.id : (raw.externalId || '')).trim() || generateDeterministicExternalId('remotive', raw);
  const title = (raw.title || '').trim();
  const organization = (raw.company_name || 'Remotive Partner').trim();

  // Classify type: INTERNSHIP vs PLACEMENT
  const isInternship = (raw.job_type && String(raw.job_type).toLowerCase().includes('intern')) ||
    title.toLowerCase().includes('intern') ||
    (Array.isArray(raw.tags) && raw.tags.some(t => String(t).toLowerCase().includes('intern')));
  const canonicalType = isInternship ? 'INTERNSHIP' : 'PLACEMENT';

  const cleanDesc = stripHtmlTags(raw.description || '');
  const description = cleanDesc
    ? (cleanDesc.length > 500 ? `${cleanDesc.slice(0, 497)}...` : cleanDesc)
    : `${title} role at ${organization}.`;

  const mode = 'ONLINE'; // Remotive is 100% remote
  const location = (raw.candidate_required_location || 'Remote (Worldwide)').trim();

  const postedDate = raw.publication_date && !isNaN(new Date(raw.publication_date).getTime())
    ? new Date(raw.publication_date)
    : new Date();

  const deadline = raw.deadline && !isNaN(new Date(raw.deadline).getTime())
    ? new Date(raw.deadline)
    : null;

  const status = computeOpportunityStatus(deadline, true);

  const sourceUrl = raw.url || (externalId ? `https://remotive.com/job/${externalId}` : 'https://remotive.com');
  const applicationUrl = raw.url || sourceUrl;

  const stipend = (raw.salary || '').trim();
  const stipendOrReward = stipend || 'Competitive Compensation';
  const fee = null;

  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'remotive');

  // Extract skills from tags + title + description
  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const contentForSkills = `${title} ${rawTags.join(' ')} ${cleanDesc.slice(0, 400)}`;
  const skills = Array.from(new Set([...rawTags.filter(t => COMMON_TECH_SKILLS.some(s => s.toLowerCase() === String(t).toLowerCase())), ...extractSkillsFromText(contentForSkills)]));
  const departments = inferDepartments(raw.category || '', '', title);

  const tags = Array.from(new Set([
    canonicalType,
    'remotive',
    'remote',
    raw.category,
    ...skills.slice(0, 5)
  ].filter(t => t && typeof t === 'string' && t.trim().length > 0).map(t => t.trim().toLowerCase())));

  return {
    externalId,
    source: 'remotive',
    type: canonicalType,
    title,
    organization,
    description,
    eligibility: {
      department: departments,
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate: null,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

/**
 * Normalize a single Arbeitnow job/internship item into the canonical Opportunity structure
 */
function normalizeArbeitnowJob(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Arbeitnow job must be an object');
  }

  const externalId = String(raw.slug || raw.id || raw.externalId || '').trim() || generateDeterministicExternalId('arbeitnow', raw);
  const title = (raw.title || '').trim();
  const organization = (raw.company_name || 'Arbeitnow Partner').trim();

  // Determine type: INTERNSHIP vs PLACEMENT
  const rawTypes = Array.isArray(raw.job_types) ? raw.job_types : [];
  const isInternship = rawTypes.some(t => /intern|apprent|ausbildung|praktik/i.test(String(t))) ||
    /intern|apprent|ausbildung|praktik/i.test(title);
  const canonicalType = isInternship ? 'INTERNSHIP' : 'PLACEMENT';

  const cleanDesc = stripHtmlTags(raw.description || '');
  const description = cleanDesc
    ? (cleanDesc.length > 500 ? `${cleanDesc.slice(0, 497)}...` : cleanDesc)
    : `${title} opportunity at ${organization}.`;

  const mode = raw.remote === true ? 'ONLINE' : (raw.remote === false ? 'OFFLINE' : 'HYBRID');
  const location = (raw.location || (mode === 'ONLINE' ? 'Remote' : 'Europe / International')).trim();

  // Created at can be seconds unix timestamp
  let postedDate = new Date();
  if (raw.created_at) {
    const parsed = typeof raw.created_at === 'number' && raw.created_at < 1e11 ? new Date(raw.created_at * 1000) : new Date(raw.created_at);
    if (!isNaN(parsed.getTime())) postedDate = parsed;
  }

  const deadline = raw.deadline && !isNaN(new Date(raw.deadline).getTime())
    ? new Date(raw.deadline)
    : null;

  const status = computeOpportunityStatus(deadline, true);

  const sourceUrl = raw.url || (externalId ? `https://www.arbeitnow.com/jobs/${externalId}` : 'https://www.arbeitnow.com');
  const applicationUrl = raw.url || sourceUrl;

  const stipend = (raw.salary || '').trim();
  const stipendOrReward = stipend || 'Standard Career Compensation';
  const fee = null;

  const { externalApplicantCount, externalStats } = extractExternalApplicantStats(raw, 'arbeitnow');

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const contentForSkills = `${title} ${rawTags.join(' ')} ${cleanDesc.slice(0, 400)}`;
  const skills = Array.from(new Set([...rawTags.filter(t => COMMON_TECH_SKILLS.some(s => s.toLowerCase() === String(t).toLowerCase())), ...extractSkillsFromText(contentForSkills)]));
  const departments = inferDepartments(rawTags.join(' '), '', title);

  const tags = Array.from(new Set([
    canonicalType,
    'arbeitnow',
    mode,
    ...skills.slice(0, 5)
  ].filter(t => t && typeof t === 'string' && t.trim().length > 0).map(t => t.trim().toLowerCase())));

  return {
    externalId,
    source: 'arbeitnow',
    type: canonicalType,
    title,
    organization,
    description,
    eligibility: {
      department: departments,
      minYear: 1,
      minCGPA: 0,
      skills
    },
    location,
    mode,
    stipend,
    stipendOrReward,
    fee,
    deadline,
    startDate: null,
    applicationUrl,
    officialUrl: applicationUrl,
    sourceUrl,
    postedDate,
    status,
    tags,
    externalApplicantCount,
    externalStats,
    fetchedAt: new Date(),
    lastUpdated: new Date()
  };
}

module.exports = {
  normalizeHopinInternship,
  normalizeHopinJob,
  normalizeHopinEvent,
  normalizeBrabbleListing,
  classifyBrabbleListingType,
  normalizeBodhDishaScholarship,
  normalizeBodhDishaCourse,
  classifyBodhDishaListingType,
  normalizeDevpostHackathon,
  normalizeRemotiveJob,
  normalizeArbeitnowJob,
  validateNormalizedOpportunity,
  generateDeterministicExternalId,
  stripHtmlTags,
  normalizeWorkMode,
  inferDepartments,
  classifyHopinEventType,
  computeOpportunityStatus,
  extractSkillsFromText,
  extractExternalApplicantStats
};
