import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function checkFirebaseClientConfig() {
  const missing = [];
  if (!firebaseConfig.apiKey) missing.push('VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!firebaseConfig.projectId) missing.push('VITE_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.appId) missing.push('VITE_FIREBASE_APP_ID');

  if (missing.length > 0) {
    const errorMsg = `Firebase Client Configuration Missing: ${missing.join(', ')}. Please configure these in client/.env.`;
    console.error(errorMsg);
    return { configured: false, error: errorMsg };
  }
  return { configured: true, error: null };
}

const { configured, error: configError } = checkFirebaseClientConfig();

let app = null;
let auth = null;

if (configured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  } catch (err) {
    console.error('Failed to initialize Firebase Client SDK:', err.message);
  }
}

export function getFirebaseAuth() {
  if (!auth) {
    const errorMsg = configError || 'Firebase Authentication is not configured. Please define VITE_FIREBASE_* in client/.env.';
    throw new Error(errorMsg);
  }
  return auth;
}

export { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  configured as isFirebaseClientConfigured
};
