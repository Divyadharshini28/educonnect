const Student = require('../models/Student');
const Application = require('../models/Application');
const { syncToDisk } = require('../config/dbPersistence');

/**
 * POST /student/profile
 * Create or update student academic profile for the verified Firebase user
 */
exports.createOrUpdateProfile = async (req, res) => {
  try {
    const { name, department, year, cgpa, skills, interests } = req.body;
    const firebaseUID = req.firebaseUID;
    const firebaseEmail = req.firebaseEmail || req.student?.email;

    if (!firebaseUID) {
      return res.status(401).json({ message: 'Unauthorized. Firebase UID missing from verified token.' });
    }

    let student = await Student.findOne({ firebaseUID });

    if (!student) {
      student = new Student({
        firebaseUID,
        name: name ? name.trim() : 'Student',
        email: firebaseEmail ? firebaseEmail.toLowerCase().trim() : `${firebaseUID}@firebaseuser.com`,
        department: department ? department.trim() : '',
        year: year !== undefined ? Number(year) : 1,
        cgpa: cgpa !== undefined ? Number(cgpa) : 0,
        skills: Array.isArray(skills) ? skills : [],
        interests: Array.isArray(interests) ? interests : []
      });
    } else {
      if (name) student.name = name.trim();
      if (firebaseEmail && !student.email) student.email = firebaseEmail.toLowerCase().trim();
      if (department !== undefined) student.department = department.trim();
      if (year !== undefined) student.year = Number(year);
      if (cgpa !== undefined) student.cgpa = Number(cgpa);
      if (skills !== undefined) student.skills = Array.isArray(skills) ? skills : [];
      if (interests !== undefined) student.interests = Array.isArray(interests) ? interests : [];
    }

    await student.save();
    await syncToDisk();

    return res.status(200).json({
      message: 'Student profile synchronized successfully.',
      student
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ message: 'Error updating student profile.', error: error.message });
  }
};

/**
 * GET /student/profile
 * Fetch current verified student profile from MongoDB
 */
exports.getProfile = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(404).json({ 
        message: 'Student profile not found. Please complete your registration profile.' 
      });
    }
    return res.status(200).json(student);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ message: 'Error fetching profile.', error: error.message });
  }
};

/**
 * GET /student/applications
 * Fetch application history for current verified student
 */
exports.getApplications = async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found.' });
    }

    const applications = await Application.find({ studentId: student._id })
      .populate('opportunityId')
      .sort({ submissionDate: -1 });

    return res.status(200).json(applications);
  } catch (error) {
    console.error('Error fetching student applications:', error);
    return res.status(500).json({ message: 'Error fetching applications.', error: error.message });
  }
};
