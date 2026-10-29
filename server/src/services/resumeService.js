const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const Student = require('../models/Student');
const { syncToDisk } = require('../config/dbPersistence');

// Cooldown configuration (default 30 days)
const COOLDOWN_DAYS = parseInt(process.env.RESUME_COOLDOWN_DAYS || '30', 10);
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const MAX_FILE_SIZE = parseInt(process.env.RESUME_MAX_FILE_SIZE || `${5 * 1024 * 1024}`, 10); // 5 MB

// In-memory concurrency locks to prevent race conditions during upload
const studentUploadLocks = new Set();

/**
 * Technical skill dictionary for comprehensive resume intelligence
 * Each entry is the canonical skill name.
 */
const EXTENDED_SKILL_CATALOG = [
  // Languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'R', 'Dart', 'Scala',
  // Web & Frontend
  'React', 'React Native', 'Next.js', 'Vue.js', 'Angular', 'HTML', 'HTML5', 'CSS', 'CSS3', 'Tailwind CSS', 'Bootstrap', 'Sass', 'Redux', 'Webpack', 'Vite',
  // Backend & APIs
  'Node.js', 'Express.js', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'REST API', 'GraphQL', 'NestJS', 'ASP.NET',
  // Databases & Storage
  'MongoDB', 'SQL', 'PostgreSQL', 'MySQL', 'SQLite', 'Redis', 'Firebase', 'Supabase', 'DynamoDB', 'Cassandra', 'Prisma', 'Mongoose',
  // Cloud & DevOps
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud', 'CI/CD', 'Git', 'GitHub', 'GitLab', 'Linux', 'Nginx', 'Terraform',
  // AI, Data Science & ML
  'Machine Learning', 'Deep Learning', 'Data Science', 'Artificial Intelligence', 'TensorFlow', 'PyTorch', 'Keras', 'Scikit-Learn', 'Pandas', 'NumPy', 'OpenCV', 'NLP', 'Computer Vision', 'Data Analysis',
  // Testing & Tools
  'Jest', 'Cypress', 'Mocha', 'Postman', 'Figma', 'Jira', 'Agile', 'Scrum', 'Microservices'
];

/**
 * Alias map: alternate/abbreviated names → canonical skill name in EXTENDED_SKILL_CATALOG.
 * Keys are lowercased for case-insensitive lookup.
 */
const SKILL_ALIASES = {
  // JavaScript aliases
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'es6': 'JavaScript',
  'es2015': 'JavaScript',
  'ecmascript': 'JavaScript',
  // TypeScript aliases
  'ts': 'TypeScript',
  'typescript': 'TypeScript',
  // Python
  'py': 'Python',
  'python3': 'Python',
  'python2': 'Python',
  // Java
  'java': 'Java',
  'j2ee': 'Java',
  // C++
  'cpp': 'C++',
  'c plus plus': 'C++',
  // C#
  'csharp': 'C#',
  'c sharp': 'C#',
  'dotnet': 'ASP.NET',
  '.net': 'ASP.NET',
  // Go
  'golang': 'Go',
  // React
  'reactjs': 'React',
  'react.js': 'React',
  // Next.js
  'nextjs': 'Next.js',
  'next js': 'Next.js',
  // Vue
  'vuejs': 'Vue.js',
  'vue': 'Vue.js',
  'vue js': 'Vue.js',
  // Angular
  'angular.js': 'Angular',
  'angularjs': 'Angular',
  // Node.js
  'nodejs': 'Node.js',
  'node': 'Node.js',
  'node js': 'Node.js',
  // Express
  'express': 'Express.js',
  'expressjs': 'Express.js',
  // MongoDB
  'mongo': 'MongoDB',
  'mongodb': 'MongoDB',
  // PostgreSQL
  'postgres': 'PostgreSQL',
  'pg': 'PostgreSQL',
  // MySQL
  'mysql': 'MySQL',
  // Redis
  'redis': 'Redis',
  // Docker
  'docker': 'Docker',
  // Kubernetes
  'k8s': 'Kubernetes',
  'kube': 'Kubernetes',
  // AWS
  'aws': 'AWS',
  'amazon aws': 'AWS',
  'amazon web services': 'AWS',
  // Azure
  'azure': 'Azure',
  'microsoft azure': 'Azure',
  // GCP / Google Cloud
  'gcp': 'Google Cloud',
  'gcp platform': 'Google Cloud',
  'google cloud platform': 'Google Cloud',
  'google cloud': 'Google Cloud',
  // Git
  'git': 'Git',
  'github': 'GitHub',
  'gitlab': 'GitLab',
  // Machine Learning
  'ml': 'Machine Learning',
  'machine learning': 'Machine Learning',
  // Deep Learning
  'deep learning': 'Deep Learning',
  'deep-learning': 'Deep Learning',
  // AI
  'ai': 'Artificial Intelligence',
  'artificial intelligence': 'Artificial Intelligence',
  // Data Science
  'data science': 'Data Science',
  // TensorFlow
  'tensorflow': 'TensorFlow',
  'tf2': 'TensorFlow',
  // PyTorch
  'pytorch': 'PyTorch',
  'torch': 'PyTorch',
  // Scikit-Learn
  'sklearn': 'Scikit-Learn',
  'scikit learn': 'Scikit-Learn',
  'scikit-learn': 'Scikit-Learn',
  // NLP
  'nlp': 'NLP',
  'natural language processing': 'NLP',
  // Computer Vision (never map 'cv' to prevent false matches with Curriculum Vitae)
  'computer vision': 'Computer Vision',
  'computervision': 'Computer Vision',
  // REST API
  'rest': 'REST API',
  'restful': 'REST API',
  'rest api': 'REST API',
  'restful api': 'REST API',
  // CI/CD
  'ci/cd': 'CI/CD',
  'ci cd': 'CI/CD',
  'cicd': 'CI/CD',
  'continuous integration': 'CI/CD',
  'continuous deployment': 'CI/CD',
  // HTML/CSS
  'html': 'HTML',
  'html5': 'HTML5',
  'css': 'CSS',
  'css3': 'CSS3',
  // Tailwind
  'tailwind': 'Tailwind CSS',
  'tailwindcss': 'Tailwind CSS',
  // Spring Boot
  'spring boot': 'Spring Boot',
  'springboot': 'Spring Boot',
  // GraphQL
  'graphql': 'GraphQL',
  // FastAPI
  'fastapi': 'FastAPI',
  // NestJS
  'nestjs': 'NestJS',
  'nest.js': 'NestJS',
  // Microservices
  'microservices': 'Microservices',
  'micro services': 'Microservices',
  // Agile/Scrum
  'agile': 'Agile',
  'scrum': 'Scrum',
  // Dart/Flutter
  'dart': 'Dart',
  'flutter': 'Dart',
  // Kotlin
  'kotlin': 'Kotlin',
  // Swift
  'swift': 'Swift',
  // Terraform
  'terraform': 'Terraform',
  // Nginx
  'nginx': 'Nginx',
  // Linux
  'linux': 'Linux',
  'unix': 'Linux',
  // SQL variants
  'sql': 'SQL',
  'plsql': 'SQL',
  'tsql': 'SQL',
  // Cassandra
  'cassandra': 'Cassandra',
  // DynamoDB
  'dynamodb': 'DynamoDB',
  'dynamo': 'DynamoDB',
  // Supabase
  'supabase': 'Supabase',
  // Prisma
  'prisma': 'Prisma',
  // Mongoose
  'mongoose': 'Mongoose',
  // Postman
  'postman': 'Postman',
  // Figma
  'figma': 'Figma',
  // Jira
  'jira': 'Jira',
  // Jest
  'jest': 'Jest',
  // Cypress
  'cypress': 'Cypress',
  // Mocha
  'mocha': 'Mocha',
  // Pandas
  'pandas': 'Pandas',
  // NumPy
  'numpy': 'NumPy',
  // OpenCV
  'opencv': 'OpenCV',
  // Keras
  'keras': 'Keras',
  // Webpack
  'webpack': 'Webpack',
  // Vite
  'vite': 'Vite',
  // Bootstrap
  'bootstrap': 'Bootstrap',
  // Sass/SCSS
  'sass': 'Sass',
  'scss': 'Sass',
  // Redux
  'redux': 'Redux',
  // Django
  'django': 'Django',
  // Flask
  'flask': 'Flask',
  // PHP
  'php': 'PHP',
  // Ruby
  'ruby': 'Ruby',
  'ruby on rails': 'Ruby',
  'ror': 'Ruby',
  // Rust
  'rust': 'Rust',
  // Go/Golang
  'go': 'Go',
  // Scala
  'scala': 'Scala',
  // R
  'r programming': 'R',
  // React Native
  'react native': 'React Native',
  'rn': 'React Native',
  // SQLite
  'sqlite': 'SQLite',
  // Firebase
  'firebase': 'Firebase',
  // Data Analysis
  'data analysis': 'Data Analysis',
  'data analytics': 'Data Analysis',
};

/**
 * Words that must never be classified as skills.
 * Comprehensive list of resume filler words, action verbs, generic nouns,
 * section headings, and common phrases.
 */
const SKILL_STOPWORDS = new Set([
  // Section headings
  'skills', 'education', 'experience', 'projects', 'certifications', 'summary',
  'objective', 'profile', 'references', 'achievements', 'awards', 'activities',
  'interests', 'hobbies', 'publications', 'languages', 'contact', 'address',
  'volunteer', 'training', 'coursework', 'declaration',
  // Action verbs
  'developed', 'created', 'designed', 'implemented', 'built', 'managed', 'led',
  'worked', 'collaborated', 'delivered', 'achieved', 'improved', 'increased',
  'reduced', 'organized', 'coordinated', 'analyzed', 'resolved', 'maintained',
  'supported', 'assisted', 'prepared', 'tested', 'reviewed', 'mentored',
  'communicated', 'presented', 'wrote', 'researched', 'launched', 'deployed',
  'automated', 'integrated', 'optimized', 'debugged', 'troubleshot', 'monitored',
  'configured', 'administered', 'operated', 'performed', 'completed', 'utilized',
  'developed', 'created', 'drove', 'ensured', 'established', 'identified',
  'identified', 'introduced', 'learned', 'migrated', 'processed', 'provided',
  'published', 'refactored', 'scaled', 'streamlined', 'succeeded', 'upgraded',
  // Generic nouns
  'project', 'application', 'system', 'platform', 'solution', 'product',
  'service', 'tool', 'technology', 'software', 'hardware', 'network',
  'database', 'server', 'client', 'user', 'team', 'team', 'organization',
  'company', 'business', 'industry', 'field', 'domain', 'area', 'environment',
  'framework', 'library', 'module', 'component', 'feature', 'functionality',
  'requirement', 'specification', 'documentation', 'report', 'test', 'analysis',
  'research', 'development', 'engineering', 'management', 'administration',
  'implementation', 'integration', 'deployment', 'configuration', 'monitoring',
  'maintenance', 'support', 'performance', 'security', 'quality', 'reliability',
  'scalability', 'efficiency', 'accuracy', 'speed', 'capacity', 'volume',
  'version', 'release', 'update', 'upgrade', 'migration', 'refactoring',
  'architecture', 'design', 'pattern', 'approach', 'method', 'methodology',
  'process', 'workflow', 'pipeline', 'lifecycle', 'strategy', 'roadmap',
  'plan', 'schedule', 'timeline', 'deadline', 'milestone', 'goal', 'objective',
  // Common filler words not caught by regex
  'responsible', 'responsibilities', 'duties', 'tasks', 'role', 'position',
  'internship', 'placement', 'hackathon', 'competition', 'scholarship', 'course',
  'workshop', 'certification', 'degree', 'bachelor', 'master', 'doctoral',
  'university', 'college', 'institute', 'school', 'department', 'faculty',
  'graduate', 'undergraduate', 'student', 'professor', 'mentor', 'supervisor',
  'employer', 'employee', 'developer', 'engineer', 'analyst', 'consultant',
  'manager', 'director', 'lead', 'senior', 'junior', 'associate', 'intern',
  'contractor', 'freelancer', 'volunteer', 'researcher', 'specialist',
  // Common conjunctions, prepositions, etc. (belt-and-suspenders)
  'and', 'the', 'for', 'with', 'from', 'this', 'that', 'have', 'were', 'been',
  'will', 'your', 'about', 'work', 'using', 'used', 'each', 'more', 'also',
  'such', 'into', 'over', 'both', 'than', 'then', 'when', 'where', 'which',
  'while', 'after', 'before', 'during', 'through', 'between', 'among', 'within',
  'across', 'along', 'around', 'under', 'above', 'below', 'beside', 'behind',
  // Numbers and units (avoid false matches on "3+ years" etc.)
  'years', 'months', 'weeks', 'days', 'hours', 'year', 'month', 'week', 'day',
]);

/**
 * Get or initialize GridFS bucket for resumes
 */
function getResumeBucket() {
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Database connection not established for GridFS.');
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'resumes'
  });
}

/**
 * Validate uploaded file buffer against MIME and Magic Bytes
 */
function validateResumeFile(buffer, originalFilename, declaredMimeType) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'File is empty.' };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds the maximum allowed limit of ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(1)} MB.`
    };
  }

  const ext = path.extname(originalFilename || '').toLowerCase();
  if (ext !== '.pdf' && ext !== '.docx') {
    return {
      valid: false,
      error: 'Invalid file format. Only PDF (.pdf) and Microsoft Word (.docx) files are supported.'
    };
  }

  // Magic bytes verification
  // PDF starts with %PDF- (0x25 0x50 0x44 0x46)
  const isPdfMagic = buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46;

  // DOCX is a Zip container starting with PK\x03\x04 (0x50 0x4B 0x03 0x04)
  const isDocxMagic = buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4B &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  if (ext === '.pdf') {
    if (!isPdfMagic) {
      return {
        valid: false,
        error: 'File content signature does not match a valid PDF document.'
      };
    }
    return {
      valid: true,
      mimeType: 'application/pdf',
      format: 'pdf'
    };
  }

  if (ext === '.docx') {
    if (!isDocxMagic) {
      return {
        valid: false,
        error: 'File content signature does not match a valid DOCX document.'
      };
    }
    return {
      valid: true,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      format: 'docx'
    };
  }

  return { valid: false, error: 'Unsupported file format.' };
}

/**
 * Stream buffer into MongoDB GridFS bucket
 */
async function uploadToGridFS(buffer, storageFilename, mimeType, studentId, originalFilename) {
  const bucket = getResumeBucket();

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(storageFilename, {
      contentType: mimeType,
      metadata: {
        studentId: studentId.toString(),
        originalFilename,
        uploadedAt: new Date()
      }
    });

    uploadStream.on('error', (err) => {
      reject(new Error(`GridFS upload failed: ${err.message}`));
    });

    uploadStream.on('finish', () => {
      resolve({
        gridFsFileId: uploadStream.id,
        filename: storageFilename,
        length: buffer.length,
        uploadDate: new Date()
      });
    });

    uploadStream.end(buffer);
  });
}

/**
 * Delete a file from MongoDB GridFS
 */
async function deleteFromGridFS(gridFsFileId) {
  try {
    if (!gridFsFileId) return false;
    const bucket = getResumeBucket();
    const objectId = typeof gridFsFileId === 'string'
      ? new mongoose.Types.ObjectId(gridFsFileId)
      : gridFsFileId;
    await bucket.delete(objectId);
    return true;
  } catch (err) {
    console.warn(`GridFS file deletion notice for ${gridFsFileId}: ${err.message}`);
    return false;
  }
}

/**
 * Retrieve raw file buffer from GridFS
 */
async function getGridFSBuffer(gridFsFileId) {
  const bucket = getResumeBucket();
  const objectId = typeof gridFsFileId === 'string'
    ? new mongoose.Types.ObjectId(gridFsFileId)
    : gridFsFileId;

  return new Promise((resolve, reject) => {
    const downloadStream = bucket.openDownloadStream(objectId);
    const chunks = [];

    downloadStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    downloadStream.on('error', (err) => {
      reject(new Error(`Failed to retrieve file from GridFS: ${err.message}`));
    });

    downloadStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Extract raw text from PDF or DOCX buffer
 */
async function extractRawText(buffer, format) {
  try {
    if (format === 'pdf') {
      const pdfModule = require('pdf-parse');
      if (typeof pdfModule === 'function') {
        const parsed = await pdfModule(buffer);
        return (parsed.text || '').trim();
      } else if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        const res = await parser.getText();
        try { await parser.destroy(); } catch (_) {}
        return (res.text || '').trim();
      }
      throw new Error('Incompatible pdf-parse interface.');
    }

    if (format === 'docx') {
      const mammoth = require('mammoth');
      const parsed = await mammoth.extractRawText({ buffer });
      return (parsed.value || '').trim();
    }

    throw new Error(`Unsupported document format: ${format}`);
  } catch (err) {
    console.error(`Text extraction error for format ${format}:`, err);
    throw err;
  }
}

/**
 * Context-aware token matching to avoid false positives for ambiguous, short, or generic terms
 */
function matchSkillInText(cleanText, token) {
  const lowerToken = token.toLowerCase();

  // Special Disambiguation 1: C Programming Language
  if (lowerToken === 'c') {
    if (!/\bC\b/.test(cleanText)) return false;
    if (/\(C\)/i.test(cleanText)) {
      const stripped = cleanText.replace(/\(C\)[^\n]*/gi, '');
      if (!/\bC\b/.test(stripped)) return false;
    }
    return (
      /(?:languages?|programming|skills|technologies|stack)[^.\n]*\bC\b/i.test(cleanText) ||
      /\bC\s*[,/&|]\s*(?:C\+\+|C#|Java|Python|Rust|Go|Assembly)\b/.test(cleanText) ||
      /(?:C\+\+|C#|Java|Python|Rust|Go|Assembly)\s*[,/&|]\s*C\b/.test(cleanText) ||
      /\bC\s+(?:programming|language|code|developer)\b/i.test(cleanText)
    );
  }

  // Special Disambiguation 2: R Language
  if (lowerToken === 'r') {
    if (!/\bR\b/.test(cleanText)) return false;
    return (
      /(?:languages?|programming|skills|data|stats|statistical)[^.\n]*\bR\b/i.test(cleanText) ||
      /\bR\s*[,/&|]\s*(?:Python|SQL|SAS|SPSS|Matlab|Pandas)\b/.test(cleanText) ||
      /(?:Python|SQL|SAS|SPSS|Matlab|Pandas)\s*[,/&|]\s*R\b/.test(cleanText) ||
      /\bR\s+(?:programming|language|script|package|studio)\b/i.test(cleanText) ||
      /\bRStudio\b/i.test(cleanText)
    );
  }

  // Special Disambiguation 3: Go Language
  if (lowerToken === 'go') {
    if (/\bgolang\b/i.test(cleanText)) return true;
    if (!/\bGo\b/.test(cleanText)) return false;
    const stripped = cleanText.replace(/\bGo\s+(?:to|through|ahead|into|back|on|for|with|from|up|down)\b/gi, '');
    if (!/\bGo\b/.test(stripped)) return false;
    return (
      /(?:languages?|programming|skills|technologies|backend|stack)[^.\n]*\bGo\b/.test(cleanText) ||
      /\bGo\s*[,/&|]\s*(?:Python|Java|Rust|C\+\+|Docker|Kubernetes|TypeScript|React)\b/.test(cleanText) ||
      /(?:Python|Java|Rust|C\+\+|Docker|Kubernetes|TypeScript|React)\s*[,/&|]\s*Go\b/.test(cleanText) ||
      /\bGo\s+(?:developer|engineer|language|programming|microservices)\b/i.test(cleanText)
    );
  }

  // Special Disambiguation 4: Py (Python alias)
  if (lowerToken === 'py') {
    return (
      /\.py\b/i.test(cleanText) ||
      /\bpy[23]\b/i.test(cleanText) ||
      /\bPy\s*[,/&|]/.test(cleanText) ||
      /\bpy\s+(?:script|code|file|developer)\b/i.test(cleanText)
    );
  }

  // Strictly reject dangerous ambiguous abbreviations:
  if (['cv', 'dl', 'ds', 'tf', 'rn'].includes(lowerToken)) return false;

  // Standard token boundary match
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^a-zA-Z0-9#+])${escaped}(?=[^a-zA-Z0-9#+]|$)`, 'i');
  return regex.test(cleanText);
}

/**
 * Extract skills, sections, and intelligence keywords from raw document text
 * 
 * Uses a hybrid, dictionary-based skill extraction pipeline:
 * 1. Primary: Direct catalog matching with word-boundary regex and contextual disambiguation (canonical names)
 * 2. Alias resolution: Known abbreviations/alternate names → canonical skill
 * 3. Deduplication: Same skill only appears once, aliases normalized to canonical
 * 4. Contextual filtering: Section-aware matching for education, experience, projects
 * 5. Keywords: Frequent domain-relevant terms (display only, not offered as skills)
 */
function extractResumeIntelligence(rawText) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return {
      status: 'PARSED_EMPTY',
      error: 'No readable text content found in document. Scanned documents or images cannot be processed directly.',
      extractedData: {
        skills: [],
        education: [],
        experience: [],
        projects: [],
        certifications: [],
        keywords: [],
        rawTextPreview: '',
        characterCount: 0
      }
    };
  }

  const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. Skill Extraction using catalog + alias map with word-boundary regex & contextual disambiguation
  // Use a canonical map to avoid duplicates (alias → same canonical name)
  const canonicalSkillsFound = new Map(); // canonical -> true

  // Step 1a: Match all canonical skills from the catalog
  for (const skill of EXTENDED_SKILL_CATALOG) {
    if (matchSkillInText(cleanText, skill)) {
      canonicalSkillsFound.set(skill, true);
    }
  }

  // Step 1b: Match all alias patterns and resolve to canonical names
  for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) {
    // Already found via catalog match
    if (canonicalSkillsFound.has(canonical)) continue;
    if (matchSkillInText(cleanText, alias)) {
      canonicalSkillsFound.set(canonical, true);
    }
  }

  // 2. Section Extraction (Education, Experience, Projects, Certifications)
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
  const education = [];
  const experience = [];
  const projects = [];
  const certifications = [];

  const eduPattern = /\b(b\.?tech|b\.?e|m\.?tech|m\.?e|bca|mca|b\.?sc|m\.?sc|ph\.?d|bachelor|master|degree|university|college|institute|cgpa|gpa|matriculation|higher secondary)\b/i;
  const expPattern = /\b(intern|internship|software engineer|developer|engineer|associate|consultant|full stack|frontend|backend|employment|experience)\b/i;
  const projPattern = /\b(project|developed|built|created|designed|implemented|github|repository|application|portal|system)\b/i;
  const certPattern = /\b(certified|certification|certificate|coursera|udemy|edx|aws certified|oracle|hackerrank|nptel)\b/i;

  for (const line of lines) {
    if (line.length < 5 || line.length > 250) continue;

    if (eduPattern.test(line) && education.length < 6) {
      if (!education.includes(line)) education.push(line);
    }
    if (expPattern.test(line) && experience.length < 6) {
      if (!experience.includes(line)) experience.push(line);
    }
    if (projPattern.test(line) && projects.length < 6) {
      if (!projects.includes(line)) projects.push(line);
    }
    if (certPattern.test(line) && certifications.length < 6) {
      if (!certifications.includes(line)) certifications.push(line);
    }
  }

  // 3. Keywords: frequent capitalized or domain-relevant terms
  // Use the extended SKILL_STOPWORDS to prevent generic words from appearing
  const words = cleanText.match(/\b[A-Za-z]{3,20}\b/g) || [];
  const wordFreq = {};

  for (const w of words) {
    const lw = w.toLowerCase();
    if (!SKILL_STOPWORDS.has(lw) && lw.length >= 4) {
      wordFreq[lw] = (wordFreq[lw] || 0) + 1;
    }
  }

  const keywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  return {
    status: 'SUCCESS',
    error: null,
    extractedData: {
      skills: Array.from(canonicalSkillsFound.keys()),
      education,
      experience,
      projects,
      certifications,
      keywords,
      rawTextPreview: cleanText.slice(0, 500),
      characterCount: cleanText.length
    }
  };
}

/**
 * Check whether a student is eligible to upload/replace their resume based on the 30-day cooldown
 */
async function checkCooldownEligibility(studentId, isAdminOverride = false) {
  const activeResume = await Resume.findOne({
    studentId,
    isActive: true
  }).sort({ uploadedAt: -1 });

  if (!activeResume) {
    return {
      eligible: true,
      inCooldown: false,
      daysRemaining: 0,
      hoursRemaining: 0,
      nextEligibleDate: null,
      lastUploadedAt: null,
      cooldownDays: COOLDOWN_DAYS,
      isAdminOverride: false
    };
  }

  const lastUploadedAt = activeResume.uploadedAt;
  const lastUploadTime = lastUploadedAt.getTime();
  const nextEligibleTime = lastUploadTime + COOLDOWN_MS;
  const now = Date.now();

  if (now < nextEligibleTime) {
    const msRemaining = nextEligibleTime - now;
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
    const hoursRemaining = Math.ceil(msRemaining / (1000 * 60 * 60));
    const nextEligibleDate = new Date(nextEligibleTime);

    if (isAdminOverride) {
      return {
        eligible: true,
        inCooldown: true,
        daysRemaining,
        hoursRemaining,
        nextEligibleDate,
        lastUploadedAt,
        cooldownDays: COOLDOWN_DAYS,
        isAdminOverride: true
      };
    }

    return {
      eligible: false,
      inCooldown: true,
      daysRemaining,
      hoursRemaining,
      nextEligibleDate,
      lastUploadedAt,
      cooldownDays: COOLDOWN_DAYS,
      isAdminOverride: false
    };
  }

  return {
    eligible: true,
    inCooldown: false,
    daysRemaining: 0,
    hoursRemaining: 0,
    nextEligibleDate: null,
    lastUploadedAt,
    cooldownDays: COOLDOWN_DAYS,
    isAdminOverride: false
  };
}

/**
 * Orchestrate resume upload, validation, GridFS storage, and intelligence extraction
 */
async function processResumeUpload({
  student,
  fileBuffer,
  originalFilename,
  declaredMimeType,
  isAdminOverride = false,
  overrideReason = null,
  overrideAdminUser = null
}) {
  const studentId = student._id;
  const studentKey = studentId.toString();

  // 1. Prevent concurrent uploads for this student
  if (studentUploadLocks.has(studentKey)) {
    throw {
      status: 409,
      code: 'CONCURRENT_UPLOAD',
      message: 'A resume upload is already in progress for your account. Please wait.'
    };
  }

  studentUploadLocks.add(studentKey);

  let newGridFsFileId = null;

  try {
    // 2. Validate file type, extension, size, and magic bytes
    const validation = validateResumeFile(fileBuffer, originalFilename, declaredMimeType);
    if (!validation.valid) {
      throw {
        status: 400,
        code: 'INVALID_FILE',
        message: validation.error
      };
    }

    // 3. Verify backend 30-day cooldown
    const cooldown = await checkCooldownEligibility(studentId, isAdminOverride);
    if (!cooldown.eligible) {
      throw {
        status: 403,
        code: 'COOLDOWN_ACTIVE',
        message: `Resume replacement is restricted to once every ${COOLDOWN_DAYS} days. Your next eligible replacement date is ${cooldown.nextEligibleDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`,
        daysRemaining: cooldown.daysRemaining,
        hoursRemaining: cooldown.hoursRemaining,
        nextEligibleDate: cooldown.nextEligibleDate,
        lastUploadedAt: cooldown.lastUploadedAt
      };
    }

    // 4. Generate safe unique storage filename
    const ext = validation.format;
    const safeHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const storageFilename = `resume_${student._id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

    // 5. Stream upload to GridFS
    const gridFsResult = await uploadToGridFS(
      fileBuffer,
      storageFilename,
      validation.mimeType,
      studentId,
      originalFilename
    );
    newGridFsFileId = gridFsResult.gridFsFileId;

    // 6. Text extraction and intelligence parsing
    let extraction;
    try {
      const rawText = await extractRawText(fileBuffer, validation.format);
      extraction = extractResumeIntelligence(rawText);
    } catch (parseErr) {
      extraction = {
        status: 'FAILED',
        error: `Document parser error: ${parseErr.message}`,
        extractedData: {
          skills: [],
          education: [],
          experience: [],
          projects: [],
          certifications: [],
          keywords: [],
          rawTextPreview: '',
          characterCount: 0
        }
      };
    }

    // 7. Find previous active resume to retire
    const previousResume = await Resume.findOne({
      studentId,
      isActive: true
    });

    // 8. Create new Resume document
    const newResume = new Resume({
      studentId: student._id,
      firebaseUID: student.firebaseUID,
      gridFsFileId: newGridFsFileId,
      filename: originalFilename,
      storageFilename,
      mimeType: validation.mimeType,
      size: fileBuffer.length,
      fileHash: safeHash,
      uploadedAt: new Date(),
      extractionStatus: extraction.status,
      extractionError: extraction.error,
      extractedData: extraction.extractedData,
      confirmedSkills: [],
      confirmedAt: null,
      isActive: true,
      adminOverride: {
        overridden: !!isAdminOverride,
        overriddenBy: overrideAdminUser || null,
        overriddenAt: isAdminOverride ? new Date() : null,
        reason: overrideReason || null
      }
    });

    await newResume.save();

    // 9. Mark previous resume inactive and safely delete its GridFS file
    if (previousResume) {
      previousResume.isActive = false;
      await previousResume.save();
      // Clean up old binary to conserve GridFS storage
      if (previousResume.gridFsFileId) {
        await deleteFromGridFS(previousResume.gridFsFileId);
      }
    }

    // 10. Update Student reference and upload timestamp
    student.resume = newResume._id;
    student.lastResumeUploadAt = newResume.uploadedAt;
    await student.save();

    // 11. Sync metadata to persistent disk store
    await syncToDisk();

    return {
      resume: newResume,
      extraction,
      cooldown: await checkCooldownEligibility(studentId, false)
    };
  } catch (err) {
    // If GridFS file was created but transaction/saving failed, clean up GridFS orphan file!
    if (newGridFsFileId) {
      try {
        await deleteFromGridFS(newGridFsFileId);
      } catch (cleanupErr) {
        console.error('Failed to clean up orphaned GridFS file after error:', cleanupErr);
      }
    }
    throw err;
  } finally {
    studentUploadLocks.delete(studentKey);
  }
}

/**
 * Confirm skills extracted from the resume and update the student profile
 */
async function confirmResumeSkills(student, skillsList) {
  if (!Array.isArray(skillsList)) {
    throw {
      status: 400,
      code: 'INVALID_INPUT',
      message: 'confirmedSkills must be an array of strings.'
    };
  }

  // Find student's active resume
  const activeResume = await Resume.findOne({
    studentId: student._id,
    isActive: true
  });

  if (!activeResume) {
    throw {
      status: 404,
      code: 'NO_ACTIVE_RESUME',
      message: 'No active resume found for this profile. Please upload a resume first.'
    };
  }

  // Clean and deduplicate confirmed skills
  const cleanedSkills = Array.from(
    new Set(
      skillsList
        .filter(s => typeof s === 'string' && s.trim().length > 0)
        .map(s => s.trim())
    )
  );

  // Update Resume confirmed skills
  activeResume.confirmedSkills = cleanedSkills;
  activeResume.confirmedAt = new Date();
  await activeResume.save();

  // Merge with existing student skills without deleting preexisting manually-entered skills
  const currentSkills = Array.isArray(student.skills) ? student.skills : [];
  const mergedMap = new Map();
  for (const s of currentSkills) {
    if (typeof s === 'string' && s.trim()) {
      mergedMap.set(s.trim().toLowerCase(), s.trim());
    }
  }
  for (const s of cleanedSkills) {
    mergedMap.set(s.toLowerCase(), s);
  }
  const mergedSkills = Array.from(mergedMap.values());

  student.skills = mergedSkills;
  await student.save();

  // Sync to disk
  await syncToDisk();

  return {
    resumeId: activeResume._id,
    confirmedSkills: cleanedSkills,
    confirmedAt: activeResume.confirmedAt,
    allStudentSkills: student.skills
  };
}

/**
 * Re-parse an existing resume without resetting cooldown or requiring a new file upload
 */
async function retryResumeExtraction(student) {
  const activeResume = await Resume.findOne({
    studentId: student._id,
    isActive: true
  });

  if (!activeResume) {
    throw {
      status: 404,
      code: 'NO_ACTIVE_RESUME',
      message: 'No active resume found to re-parse.'
    };
  }

  const buffer = await getGridFSBuffer(activeResume.gridFsFileId);
  const format = activeResume.mimeType.includes('pdf') ? 'pdf' : 'docx';

  let extraction;
  try {
    const rawText = await extractRawText(buffer, format);
    extraction = extractResumeIntelligence(rawText);
  } catch (err) {
    extraction = {
      status: 'FAILED',
      error: `Retry parsing failed: ${err.message}`,
      extractedData: {
        skills: [],
        education: [],
        experience: [],
        projects: [],
        certifications: [],
        keywords: [],
        rawTextPreview: '',
        characterCount: 0
      }
    };
  }

  activeResume.extractionStatus = extraction.status;
  activeResume.extractionError = extraction.error;
  activeResume.extractedData = extraction.extractedData;
  await activeResume.save();

  await syncToDisk();

  return {
    resume: activeResume,
    extraction
  };
}

module.exports = {
  COOLDOWN_DAYS,
  COOLDOWN_MS,
  MAX_FILE_SIZE,
  EXTENDED_SKILL_CATALOG,
  SKILL_ALIASES,
  SKILL_STOPWORDS,
  getResumeBucket,
  validateResumeFile,
  uploadToGridFS,
  deleteFromGridFS,
  getGridFSBuffer,
  extractRawText,
  extractResumeIntelligence,
  checkCooldownEligibility,
  processResumeUpload,
  confirmResumeSkills,
  retryResumeExtraction
};
