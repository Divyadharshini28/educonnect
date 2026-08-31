const path = require('path');
const fs = require('fs');
let admin = null;
let getAuth = null;

try {
  admin = require('firebase-admin');
  const authModule = require('firebase-admin/auth');
  getAuth = authModule.getAuth;
} catch (err) {
  console.error('firebase-admin package could not be loaded:', err.message);
}

let firebaseAdminApp = null;
let firebaseAuthInstance = null;
let initError = null;

function resolveServiceAccountPath(filePath) {
  if (!filePath) return null;
  
  const candidates = [
    path.resolve(filePath),
    path.resolve(process.cwd(), filePath),
    path.resolve(__dirname, '../../', filePath),
    path.resolve(__dirname, '../../../', filePath)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function initFirebase() {
  if (firebaseAdminApp && firebaseAuthInstance) {
    return { admin, app: firebaseAdminApp, auth: firebaseAuthInstance };
  }

  if (!admin) {
    initError = 'firebase-admin package is missing in server dependencies. Please run npm install firebase-admin.';
    console.error(initError);
    return null;
  }

  try {
    const certFn = (sa) => (admin.cert ? admin.cert(sa) : admin.credential?.cert ? admin.credential.cert(sa) : sa);

    // 1. Service account JSON provided as environment variable string
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        firebaseAdminApp = admin.initializeApp({
          credential: certFn(serviceAccount)
        });
        firebaseAuthInstance = getAuth ? getAuth(firebaseAdminApp) : admin.auth(firebaseAdminApp);
        console.log('Firebase Admin SDK initialized using FIREBASE_SERVICE_ACCOUNT_KEY.');
        return { admin, app: firebaseAdminApp, auth: firebaseAuthInstance };
      } catch (parseErr) {
        initError = `Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON: ${parseErr.message}`;
        console.error(initError);
        return null;
      }
    }

    // 2. Service account JSON file path provided in environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const resolvedPath = resolveServiceAccountPath(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      if (resolvedPath) {
        const serviceAccount = require(resolvedPath);
        firebaseAdminApp = admin.initializeApp({
          credential: certFn(serviceAccount)
        });
        firebaseAuthInstance = getAuth ? getAuth(firebaseAdminApp) : admin.auth(firebaseAdminApp);
        console.log(`Firebase Admin SDK initialized using service account file at: ${resolvedPath}`);
        return { admin, app: firebaseAdminApp, auth: firebaseAuthInstance };
      } else {
        initError = `Firebase service account file not found for path: ${process.env.FIREBASE_SERVICE_ACCOUNT_PATH}`;
        console.error(initError);
        return null;
      }
    }

    // 3. Fallback to standard default service account file location if present
    const defaultLocalPath = resolveServiceAccountPath('firebase-service-account.json');
    if (defaultLocalPath) {
      const serviceAccount = require(defaultLocalPath);
      firebaseAdminApp = admin.initializeApp({
        credential: certFn(serviceAccount)
      });
      firebaseAuthInstance = getAuth ? getAuth(firebaseAdminApp) : admin.auth(firebaseAdminApp);
      console.log(`Firebase Admin SDK initialized using local file at: ${defaultLocalPath}`);
      return { admin, app: firebaseAdminApp, auth: firebaseAuthInstance };
    }

    // 4. Fallback to Google Application Default Credentials if set in environment
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const appDefault = admin.applicationDefault ? admin.applicationDefault() : admin.credential?.applicationDefault();
      firebaseAdminApp = admin.initializeApp({
        credential: appDefault
      });
      firebaseAuthInstance = getAuth ? getAuth(firebaseAdminApp) : admin.auth(firebaseAdminApp);
      console.log('Firebase Admin SDK initialized using GOOGLE_APPLICATION_CREDENTIALS.');
      return { admin, app: firebaseAdminApp, auth: firebaseAuthInstance };
    }

    initError = 'Firebase Admin credentials not found. Please specify FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_KEY in server/.env.';
    console.warn(initError);
  } catch (error) {
    initError = `Firebase Admin initialization failed: ${error.message}`;
    console.error(initError);
  }

  return { admin, app: firebaseAdminApp, auth: firebaseAuthInstance };
}

function getFirebaseAuthAdmin() {
  if (!firebaseAdminApp || !firebaseAuthInstance) {
    initFirebase();
  }
  if (!firebaseAdminApp || !firebaseAuthInstance) {
    const errorMsg = initError || 'Firebase Admin SDK is not configured. Please supply server-side Firebase service account credentials in server/.env.';
    const err = new Error(errorMsg);
    err.code = 'FIREBASE_NOT_CONFIGURED';
    throw err;
  }
  return firebaseAuthInstance;
}

function isFirebaseConfigured() {
  if (!firebaseAdminApp || !firebaseAuthInstance) {
    initFirebase();
  }
  return !!firebaseAdminApp && !!firebaseAuthInstance;
}

module.exports = {
  initFirebase,
  getFirebaseAuthAdmin,
  isFirebaseConfigured
};
