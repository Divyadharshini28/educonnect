const Student = require('../models/Student');
const { getFirebaseAuthAdmin } = require('../config/firebase');

/**
 * Express middleware to enforce Firebase ID Token authentication on protected routes.
 *
 * Verifies Authorization: Bearer <Firebase ID Token> using the Firebase Admin SDK.
 * Extracts the verified Firebase UID (decodedToken.uid) and attaches student record from MongoDB.
 */
const requireAuth = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-uid']) {
      req.firebaseUID = req.headers['x-test-uid'];
      req.firebaseEmail = req.headers['x-test-email'] || 'test@educonnect.test';
      req.decodedToken = {
        uid: req.headers['x-test-uid'],
        email: req.headers['x-test-email'] || 'test@educonnect.test',
        admin: req.headers['x-test-role'] === 'admin'
      };
      let student = await Student.findOne({ firebaseUID: req.firebaseUID });
      if (!student) {
        student = {
          _id: new (require('mongoose').Types.ObjectId)(),
          firebaseUID: req.firebaseUID,
          email: req.firebaseEmail,
          role: req.headers['x-test-role'] || 'student'
        };
      }
      req.student = student;
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Authentication required. Authorization Bearer token must be provided.' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token || token.trim() === '') {
      return res.status(401).json({ 
        message: 'Authentication token is empty or malformed.' 
      });
    }

    let authAdmin;
    try {
      authAdmin = getFirebaseAuthAdmin();
    } catch (configErr) {
      console.error('Firebase Admin configuration error:', configErr.message);
      return res.status(500).json({ 
        message: 'Server configuration error: Firebase Admin credentials are not configured on the server.',
        error: configErr.message
      });
    }

    let decodedToken;
    try {
      decodedToken = await authAdmin.verifyIdToken(token);
    } catch (fbErr) {
      console.warn('Firebase ID token verification failed:', fbErr.message);
      return res.status(401).json({ 
        message: 'Invalid, revoked, or expired Firebase ID token. Please sign in again.',
        code: fbErr.code || 'AUTH_TOKEN_INVALID'
      });
    }

    const firebaseUID = decodedToken.uid;
    const firebaseEmail = decodedToken.email;

    if (!firebaseUID) {
      return res.status(401).json({ 
        message: 'Unauthorized: Decoded Firebase token contains no UID.' 
      });
    }

    // Lookup student record in MongoDB using the verified Firebase UID
    const student = await Student.findOne({ firebaseUID });

    req.firebaseUID = firebaseUID;
    req.firebaseEmail = firebaseEmail;
    req.student = student;
    req.decodedToken = decodedToken;

    next();
  } catch (error) {
    console.error('Unhandled authentication middleware error:', error);
    return res.status(500).json({ 
      message: 'Internal server error during authentication verification.',
      error: error.message 
    });
  }
};

/**
 * Express middleware to enforce administrator authorization on protected admin routes.
 * 
 * Verifies:
 * 1. User is authenticated (req.student / req.firebaseUID).
 * 2. User has administrative privileges via:
 *    - req.student?.role === 'admin'
 *    - req.decodedToken?.admin === true (custom claim)
 *    - Email listed in process.env.ADMIN_EMAILS (default includes 'admin@educonnect.ac.in', 'admin@educonnect.com')
 *    - (In test mode: x-test-role === 'admin')
 * 
 * Unauthenticated -> 401 Unauthorized
 * Authenticated non-admin -> 403 Forbidden
 */
const requireAdmin = async (req, res, next) => {
  // If requireAuth hasn't run yet, run it
  if (!req.firebaseUID && !req.headers.authorization && (!req.headers['x-test-role'] || process.env.NODE_ENV !== 'test')) {
    return res.status(401).json({ 
      message: 'Authentication required. Authorization Bearer token must be provided.' 
    });
  }

  // If requireAuth wasn't invoked prior, invoke it
  if (!req.firebaseUID && req.headers.authorization) {
    return requireAuth(req, res, () => checkAdminRole(req, res, next));
  }

  return checkAdminRole(req, res, next);
};

function checkAdminRole(req, res, next) {
  // Check test header if in test mode
  if (process.env.NODE_ENV === 'test' && req.headers['x-test-role'] === 'admin') {
    req.isAdmin = true;
    return next();
  }

  const configuredAdminEmails = (process.env.ADMIN_EMAILS || 'admin@educonnect.ac.in,admin@educonnect.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const userEmail = (req.firebaseEmail || req.student?.email || '').toLowerCase();

  const isRoleAdmin = req.student?.role === 'admin';
  const isClaimAdmin = req.decodedToken?.admin === true || req.decodedToken?.role === 'admin';
  const isConfiguredEmail = userEmail && configuredAdminEmails.includes(userEmail);

  if (isRoleAdmin || isClaimAdmin || isConfiguredEmail) {
    req.isAdmin = true;
    return next();
  }

  return res.status(403).json({ 
    message: 'Forbidden: Administrative privileges are required to perform this action.' 
  });
}

module.exports = {
  requireAuth,
  requireAdmin
};
