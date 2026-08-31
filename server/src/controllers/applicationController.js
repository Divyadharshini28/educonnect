const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const { syncToDisk } = require('../config/dbPersistence');

/**
 * POST /applications
 * Submit an application for an opportunity
 */
exports.submitApplication = async (req, res) => {
  try {
    const student = req.student;
    const { opportunityId, responses } = req.body;

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

    const application = new Application({
      studentId: student._id,
      opportunityId,
      opportunityTitle: opportunity.title,
      opportunityType: opportunity.type,
      opportunityOrg: opportunity.organization,
      opportunityUrl: opportunity.officialUrl,
      status: 'Submitted',
      submissionDate: new Date(),
      responses: responses || {}
    });

    await application.save();
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
 * Update status
 */
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['Submitted', 'Under Review', 'Accepted', 'Rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Valid options are: ${validStatuses.join(', ')}` 
      });
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('opportunityId');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    await syncToDisk();

    return res.status(200).json({
      message: `Application status updated to ${status}`,
      application
    });
  } catch (error) {
    console.error('Error updating application status:', error);
    return res.status(500).json({ message: 'Error updating status', error: error.message });
  }
};
