const multer = require('multer');
const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const Student = require('../models/Student');
const resumeService = require('../services/resumeService');

// Multer memory storage (keeps in memory buffer before streaming to GridFS)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: resumeService.MAX_FILE_SIZE
  }
}).single('resume');

/**
 * Middleware wrapper to gracefully handle multer errors (such as file size limits)
 */
function handleMulterUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: `File size exceeds the maximum limit of ${(resumeService.MAX_FILE_SIZE / (1024 * 1024)).toFixed(1)} MB.`,
          code: 'FILE_TOO_LARGE'
        });
      }
      return res.status(400).json({
        message: `File upload error: ${err.message}`,
        code: 'UPLOAD_ERROR'
      });
    }
    next();
  });
}

/**
 * Upload a resume (PDF or DOCX), validate, stream to GridFS, and extract skills
 * POST /student/resume/upload
 */
async function uploadResume(req, res) {
  try {
    if (!req.student) {
      return res.status(401).json({ message: 'Authentication required. Student profile not found.' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        message: 'No file uploaded. Please attach a resume document under the "resume" field.',
        code: 'NO_FILE'
      });
    }

    // Check for admin override credentials
    const isAdmin = req.decodedToken?.admin === true ||
      req.student?.role === 'admin' ||
      (process.env.NODE_ENV === 'test' && req.headers['x-test-role'] === 'admin');

    const requestedOverride = req.body.adminOverride === 'true' || req.body.adminOverride === true;
    let isAdminOverride = false;
    let overrideReason = null;
    let overrideAdminUser = null;

    if (requestedOverride) {
      if (!isAdmin) {
        return res.status(403).json({
          message: 'Administrative privileges required to override 30-day replacement cooldown.',
          code: 'ADMIN_OVERRIDE_FORBIDDEN'
        });
      }
      isAdminOverride = true;
      overrideReason = req.body.overrideReason || 'Administrative override requested';
      overrideAdminUser = req.student.email || req.firebaseEmail || 'Admin';
    }

    const result = await resumeService.processResumeUpload({
      student: req.student,
      fileBuffer: req.file.buffer,
      originalFilename: req.file.originalname,
      declaredMimeType: req.file.mimetype,
      isAdminOverride,
      overrideReason,
      overrideAdminUser
    });

    return res.status(201).json({
      message: 'Resume uploaded and analyzed successfully.',
      resume: {
        id: result.resume._id,
        filename: result.resume.filename,
        size: result.resume.size,
        mimeType: result.resume.mimeType,
        uploadedAt: result.resume.uploadedAt,
        extractionStatus: result.resume.extractionStatus,
        extractionError: result.resume.extractionError,
        characterCount: result.resume.extractedData?.characterCount || 0
      },
      extractedData: result.resume.extractedData,
      cooldown: result.cooldown
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        code: error.code || 'RESUME_ERROR',
        daysRemaining: error.daysRemaining,
        hoursRemaining: error.hoursRemaining,
        nextEligibleDate: error.nextEligibleDate,
        lastUploadedAt: error.lastUploadedAt
      });
    }

    console.error('Unhandled resume upload error:', error);
    return res.status(500).json({
      message: 'Internal server error while processing resume.',
      error: error.message
    });
  }
}

/**
 * Get active resume metadata, parsed intelligence, confirmed skills, and cooldown status
 * GET /student/resume
 */
async function getResumeStatus(req, res) {
  try {
    if (!req.student) {
      return res.status(401).json({ message: 'Authentication required. Student profile not found.' });
    }

    const activeResume = await Resume.findOne({
      studentId: req.student._id,
      isActive: true
    }).sort({ uploadedAt: -1 });

    const cooldown = await resumeService.checkCooldownEligibility(req.student._id, false);

    if (!activeResume) {
      return res.json({
        hasResume: false,
        resume: null,
        cooldown
      });
    }

    return res.json({
      hasResume: true,
      resume: {
        id: activeResume._id,
        filename: activeResume.filename,
        size: activeResume.size,
        mimeType: activeResume.mimeType,
        uploadedAt: activeResume.uploadedAt,
        extractionStatus: activeResume.extractionStatus,
        extractionError: activeResume.extractionError,
        extractedData: activeResume.extractedData,
        confirmedSkills: activeResume.confirmedSkills,
        confirmedAt: activeResume.confirmedAt,
        adminOverride: activeResume.adminOverride
      },
      cooldown
    });
  } catch (error) {
    console.error('Failed to get resume status:', error);
    return res.status(500).json({
      message: 'Failed to retrieve resume status.',
      error: error.message
    });
  }
}

/**
 * Download original resume file from MongoDB GridFS
 * GET /student/resume/download
 * GET /student/resume/download/:resumeId
 */
async function downloadResume(req, res) {
  try {
    if (!req.student) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    let resume;
    const requestedId = req.params.resumeId;

    if (requestedId) {
      if (!mongoose.Types.ObjectId.isValid(requestedId)) {
        return res.status(400).json({ message: 'Invalid resume ID format.' });
      }
      resume = await Resume.findById(requestedId);
    } else {
      resume = await Resume.findOne({
        studentId: req.student._id,
        isActive: true
      }).sort({ uploadedAt: -1 });
    }

    if (!resume) {
      return res.status(404).json({ message: 'Resume document not found.' });
    }

    // Authorization & Ownership check
    const isOwner = resume.studentId.toString() === req.student._id.toString();
    const isAdmin = req.decodedToken?.admin === true ||
      req.student?.role === 'admin' ||
      (process.env.NODE_ENV === 'test' && req.headers['x-test-role'] === 'admin');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        message: 'Access denied. You do not have permission to view or download another student\'s resume.',
        code: 'FORBIDDEN_RESUME_ACCESS'
      });
    }

    const bucket = resumeService.getResumeBucket();
    const fileId = resume.gridFsFileId;

    res.setHeader('Content-Type', resume.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(resume.filename)}"`
    );

    const downloadStream = bucket.openDownloadStream(fileId);

    downloadStream.on('error', (err) => {
      console.error('GridFS streaming error during download:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to stream resume file from storage.', error: err.message });
      }
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error('Download resume error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Failed to download resume.', error: error.message });
    }
  }
}

/**
 * Confirm skills extracted from the resume and update the student profile
 * POST /student/resume/confirm-skills
 */
async function confirmSkills(req, res) {
  try {
    if (!req.student) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { confirmedSkills } = req.body;
    if (!Array.isArray(confirmedSkills)) {
      return res.status(400).json({
        message: 'confirmedSkills must be provided as an array of skill strings.',
        code: 'INVALID_SKILLS_FORMAT'
      });
    }

    const result = await resumeService.confirmResumeSkills(req.student, confirmedSkills);

    return res.json({
      message: 'Skills confirmed and student profile successfully updated.',
      resumeId: result.resumeId,
      confirmedSkills: result.confirmedSkills,
      confirmedAt: result.confirmedAt,
      allStudentSkills: result.allStudentSkills
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        code: error.code || 'SKILL_CONFIRMATION_ERROR'
      });
    }
    console.error('Failed to confirm skills:', error);
    return res.status(500).json({
      message: 'Failed to confirm skills.',
      error: error.message
    });
  }
}

/**
 * Retry text extraction and intelligence on existing active resume
 * POST /student/resume/retry-parse
 */
async function retryParse(req, res) {
  try {
    if (!req.student) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const result = await resumeService.retryResumeExtraction(req.student);

    return res.json({
      message: 'Resume re-parsed successfully.',
      extractionStatus: result.extraction.status,
      extractionError: result.extraction.error,
      extractedData: result.extraction.extractedData
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        code: error.code || 'RETRY_PARSE_ERROR'
      });
    }
    console.error('Failed to re-parse resume:', error);
    return res.status(500).json({
      message: 'Failed to re-parse resume.',
      error: error.message
    });
  }
}

/**
 * Administrative override to reset cooldown or permit immediate re-upload
 * POST /student/resume/admin-override-cooldown
 */
async function adminOverrideCooldown(req, res) {
  try {
    const { studentId, reason } = req.body;
    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required.' });
    }

    const targetStudent = await Student.findById(studentId);
    if (!targetStudent) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const activeResume = await Resume.findOne({
      studentId: targetStudent._id,
      isActive: true
    });

    if (!activeResume) {
      return res.status(404).json({ message: 'Student does not have an active resume.' });
    }

    // Set upload timestamp to past (beyond 30 days) to clear cooldown
    activeResume.uploadedAt = new Date(Date.now() - (resumeService.COOLDOWN_MS + 1000));
    activeResume.adminOverride = {
      overridden: true,
      overriddenBy: req.student?.email || req.firebaseEmail || 'Admin',
      overriddenAt: new Date(),
      reason: reason || 'Manual administrative cooldown reset'
    };
    await activeResume.save();

    targetStudent.lastResumeUploadAt = activeResume.uploadedAt;
    await targetStudent.save();

    const newCooldown = await resumeService.checkCooldownEligibility(targetStudent._id, false);

    return res.json({
      message: 'Resume cooldown successfully reset for student by administrator.',
      studentId: targetStudent._id,
      cooldown: newCooldown
    });
  } catch (error) {
    console.error('Admin cooldown override error:', error);
    return res.status(500).json({
      message: 'Failed to override cooldown.',
      error: error.message
    });
  }
}

module.exports = {
  handleMulterUpload,
  uploadResume,
  getResumeStatus,
  downloadResume,
  confirmSkills,
  retryParse,
  adminOverrideCooldown
};
