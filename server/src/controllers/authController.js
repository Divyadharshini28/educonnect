const Student = require('../models/Student');
const { syncToDisk } = require('../config/dbPersistence');

/**
 * POST /auth/register (or /auth/sync)
 * Synchronizes initial student profile data for an authenticated Firebase user.
 * Protected by requireAuth middleware.
 */
exports.register = async (req, res) => {
  try {
    const { name, department, year, cgpa, skills, interests } = req.body;
    const firebaseUID = req.firebaseUID;
    const firebaseEmail = req.firebaseEmail || req.student?.email;

    if (!firebaseUID) {
      return res.status(401).json({ message: 'Unauthorized. Firebase UID required.' });
    }

    let student = await Student.findOne({ firebaseUID });

    if (student) {
      if (name) student.name = name.trim();
      if (department !== undefined) student.department = department.trim();
      if (year !== undefined) student.year = Number(year);
      if (cgpa !== undefined) student.cgpa = Number(cgpa);
      if (skills !== undefined) student.skills = Array.isArray(skills) ? skills : [];
      if (interests !== undefined) student.interests = Array.isArray(interests) ? interests : [];
    } else {
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
    }

    await student.save();
    await syncToDisk();

    return res.status(200).json({
      message: 'Student profile registered successfully.',
      student
    });
  } catch (error) {
    console.error('Error in auth register profile sync:', error);
    return res.status(500).json({ message: 'Server error during profile registration.', error: error.message });
  }
};

/**
 * POST /auth/logout
 */
exports.logout = async (req, res) => {
  return res.status(200).json({ message: 'Logged out successfully.' });
};
