const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Interaction = require('../models/Interaction');
const { syncToDisk } = require('../config/dbPersistence');

// Valid application statuses and allowed transitions
const VALID_STATUSES = ['Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Offered', 'Accepted', 'Rejected', 'Withdrawn'];

// Student-permitted status updates (for external applications only)
const STUDENT_REPORTABLE_STATUSES = ['Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Offered', 'Accepted', 'Rejected', 'Withdrawn'];

/**
 * POST /applications
 * Submit an application for an opportunity
 */
exports.submitApplication = async (req, res) => {
  try {
    const student = req.student;
    const { opportunityId, responses, applicationMethod } = req.body;

    if (!student) {
      return res.status(401).json({ message: 'Student authentication required.' });
    }

    if (!opportunityId) {
      return res.status(400).json({ message: 'opportunityId is required.' });
    }

    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      return res.status(404).json({ message: 'Opportunity not found.' });
    }

    const existing = await Application.findOne({
      studentId: student._id,
      opportunityId
    });

    if (existing) {
      return res.status(400).json({
        message: 'You have already submitted an application for this opportunity.',
        application: existing
      });
    }

    // Determine application method: external opportunities use external-link by default
    const method = applicationMethod || (
      opportunity.source && opportunity.source !== 'internal' ? 'external-link' : 'internal'
    );

    const application = new Application({
      studentId: student._id,
      opportunityId,
      opportunityTitle: opportunity.title,
      opportunityType: opportunity.type,
      opportunityOrg: opportunity.organization,
      opportunityUrl: opportunity.officialUrl,
      status: 'Submitted',
      statusHistory: [{
        status: 'Submitted',
        changedAt: new Date(),
        source: method === 'external-link' ? 'student-reported' : 'system',
        note: method === 'external-link'
          ? 'Student recorded external application submission'
          : 'Application submitted through EduConnect',
        changedBy: student.email || 'student'
      }],
      applicationMethod: method,
      isStudentReported: method === 'external-link',
      submissionDate: new Date(),
      responses: responses || {}
    });

    await application.save();

    // Record behavioral APPLY interaction
    try {
      const interaction = new Interaction({
        studentId: student._id,
        opportunityId: opportunity._id,
        interactionType: 'APPLY',
        timestamp: new Date(),
        metadata: {
          source: 'application-submission',
          applicationId: application._id,
          applicationMethod: method
        }
      });
      await interaction.save();
    } catch (interactionErr) {
      console.warn('Analytics notice: Could not record APPLY interaction:', interactionErr.message);
    }

    await syncToDisk();

    const populated = await Application.findById(application._id).populate('opportunityId');

    return res.status(201).json({
      message: 'Application submitted successfully.',
      application: populated
    });
  } catch (error) {
    console.error('Error submitting application:', error);
    return res.status(500).json({ message: 'Error submitting application', error: error.message });
  }
};

/**
 * GET /applications/:id
 * Fetch application status and details
 */
exports.getApplicationById = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate('studentId', 'name email department year cgpa skills')
      .populate('opportunityId');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    return res.status(200).json(application);
  } catch (error) {
    console.error('Error fetching application:', error);
    return res.status(500).json({ message: 'Error fetching application', error: error.message });
  }
};

/**
 * PUT /applications/:id
 * Update application status — admin route (all statuses permitted)
 */
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status, note } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Valid options are: ${VALID_STATUSES.join(', ')}` 
      });
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const previousStatus = application.status;

    // Do not add duplicate consecutive status entries
    if (previousStatus !== status) {
      application.statusHistory.push({
        status,
        changedAt: new Date(),
        source: 'admin-recorded',
        note: note || `Status updated from ${previousStatus} to ${status}`,
        changedBy: req.student?.email || req.firebaseEmail || 'admin'
      });
    }

    application.status = status;
    await application.save();

    await syncToDisk();

    const populated = await Application.findById(application._id).populate('opportunityId');

    return res.status(200).json({
      message: `Application status updated to ${status}`,
      application: populated
    });
  } catch (error) {
    console.error('Error updating application status:', error);
    return res.status(500).json({ message: 'Error updating status', error: error.message });
  }
};

/**
 * PATCH /applications/:id/student-update
 * Student-reported status update — for external applications where verification is unavailable.
 * Students can only report their own applications and only within allowed statuses.
 */
exports.studentUpdateApplicationStatus = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { status, note } = req.body;

    if (!status || !STUDENT_REPORTABLE_STATUSES.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Reportable options are: ${STUDENT_REPORTABLE_STATUSES.join(', ')}` 
      });
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    // Authorization: only the owning student can self-report status
    if (application.studentId.toString() !== student._id.toString()) {
      return res.status(403).json({ message: 'You may only update your own applications.' });
    }

    // Only allow student-reporting for external applications
    if (application.applicationMethod === 'internal') {
      return res.status(400).json({
        message: 'Student-reported status updates are only available for externally applied opportunities. Internal application statuses are managed by administrators.'
      });
    }

    const previousStatus = application.status;

    // Do not add duplicate consecutive status entries
    if (previousStatus !== status) {
      application.statusHistory.push({
        status,
        changedAt: new Date(),
        source: 'student-reported',
        note: note || `Student reported status: ${status}`,
        changedBy: student.email || 'student'
      });

      application.status = status;
      application.isStudentReported = true;
    }

    await application.save();
    await syncToDisk();

    const populated = await Application.findById(application._id).populate('opportunityId');

    return res.status(200).json({
      message: `Application status self-reported as: ${status}. This update is student-reported and not verified by the provider.`,
      application: populated
    });
  } catch (error) {
    console.error('Error processing student status update:', error);
    return res.status(500).json({ message: 'Error updating application status', error: error.message });
  }
};
