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

    next();
  } catch (error) {
    console.error('Unhandled authentication middleware error:', error);
    return res.status(500).json({ 
      message: 'Internal server error during authentication verification.',
      error: error.message 
    });
  }
};

module.exports = {
  requireAuth
};
