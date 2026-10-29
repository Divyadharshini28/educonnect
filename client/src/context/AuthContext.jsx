import React, { createContext, useContext, useState, useEffect } from 'react';
import api, { setAuthTokenGetter } from '../api';
import { 
  auth, 
  getFirebaseAuth,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  isFirebaseClientConfigured
} from '../firebase';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Hook dynamic token getter into API interceptor (authoritative Firebase token only)
  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (auth && auth.currentUser) {
        try {
          return await auth.currentUser.getIdToken();
        } catch (err) {
          console.error('Failed to retrieve Firebase ID token:', err);
        }
      }
      return null;
    });
  }, []);

  // Listen to native Firebase Authentication state changes
  useEffect(() => {
    if (!isFirebaseClientConfigured || !auth) {
      setAuthError('Firebase Client Authentication is not configured. Please supply VITE_FIREBASE_* variables in client/.env.');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          localStorage.setItem('educonnect_token', idToken);
          setCurrentUser(firebaseUser);

          // Fetch student record from MongoDB associated with verified Firebase UID
          const res = await api.get('/student/profile', {
            headers: { Authorization: `Bearer ${idToken}` }
          });
          
          if (res.data) {
            setStudentProfile(res.data);
            localStorage.setItem('educonnect_student', JSON.stringify(res.data));
          }
        } catch (err) {
          // If profile does not exist in MongoDB yet, keep user authenticated and prompt profile setup
          if (err.response?.status === 404) {
            setStudentProfile(null);
          } else {
            console.warn('Profile fetch notice on auth state change:', err.message);
          }
        }
      } else {
        setCurrentUser(null);
        setStudentProfile(null);
        localStorage.removeItem('educonnect_token');
        localStorage.removeItem('educonnect_student');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Register Student via Firebase Client SDK
  const registerStudent = async ({ name, email, password, department, year, cgpa, skills, interests, preferredLocation }) => {
    setLoading(true);
    try {
      const authInstance = getFirebaseAuth();

      // 1. Authenticate with Firebase Email/Password
      const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
      const firebaseUser = userCredential.user;
      const idToken = await firebaseUser.getIdToken();

      localStorage.setItem('educonnect_token', idToken);

      // 2. Associate student profile in MongoDB via authenticated backend request
      const res = await api.post(
        '/student/profile',
        {
          name: name.trim(),
          department: department ? department.trim() : '',
          year: Number(year) || 1,
          cgpa: cgpa !== undefined ? Number(cgpa) : 0,
          skills: Array.isArray(skills) ? skills : [],
          interests: Array.isArray(interests) ? interests : [],
          preferredLocation: preferredLocation ? preferredLocation.trim() : ''
        },
        {
          headers: { Authorization: `Bearer ${idToken}` }
        }
      );

      const student = res.data.student;
      setCurrentUser(firebaseUser);
      setStudentProfile(student);
      localStorage.setItem('educonnect_student', JSON.stringify(student));

      return { success: true, student };
    } catch (error) {
      console.error('Firebase registration error:', error);
      let userFriendlyMessage = error.message;

      if (error.code === 'auth/email-already-in-use') {
        userFriendlyMessage = 'This email address is already registered. Please sign in instead.';
      } else if (error.code === 'auth/weak-password') {
        userFriendlyMessage = 'Password must be at least 6 characters long.';
      } else if (error.code === 'auth/invalid-email') {
        userFriendlyMessage = 'Please provide a valid email address.';
      } else if (error.code === 'auth/network-request-failed') {
        userFriendlyMessage = 'Network connection issue. Please check your internet connection and try again.';
      } else if (error.response?.data?.message) {
        userFriendlyMessage = error.response.data.message;
      }

      return { success: false, message: userFriendlyMessage };
    } finally {
      setLoading(false);
    }
  };

  // Login Student via Firebase Client SDK
  const loginStudent = async (email, password) => {
    setLoading(true);
    try {
      const authInstance = getFirebaseAuth();

      // 1. Authenticate with Firebase Email/Password
      const userCredential = await signInWithEmailAndPassword(authInstance, email, password);
      const firebaseUser = userCredential.user;
      const idToken = await firebaseUser.getIdToken();

      localStorage.setItem('educonnect_token', idToken);

      // 2. Retrieve student profile from MongoDB using verified Firebase ID token
      try {
        const res = await api.get('/student/profile', {
          headers: { Authorization: `Bearer ${idToken}` }
        });

        const student = res.data;
        setCurrentUser(firebaseUser);
        setStudentProfile(student);
        localStorage.setItem('educonnect_student', JSON.stringify(student));

        return { success: true, student };
      } catch (profileErr) {
        // If user exists in Firebase Auth but MongoDB record was not created, allow sign in and prompt profile completion
        if (profileErr.response?.status === 404) {
          setCurrentUser(firebaseUser);
          setStudentProfile(null);
          return { success: true, student: null, needsProfileSetup: true };
        }
        throw profileErr;
      }
    } catch (error) {
      console.error('Firebase login error:', error);
      let userFriendlyMessage = error.message;

      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        userFriendlyMessage = 'Invalid email or password. Please verify your credentials.';
      } else if (error.code === 'auth/invalid-email') {
        userFriendlyMessage = 'Please provide a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        userFriendlyMessage = 'Too many failed login attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        userFriendlyMessage = 'Network connection issue. Please check your internet connection and try again.';
      } else if (error.response?.data?.message) {
        userFriendlyMessage = error.response.data.message;
      }

      return { success: false, message: userFriendlyMessage };
    } finally {
      setLoading(false);
    }
  };

  // Logout Student via Firebase Client SDK
  const logoutStudent = async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (err) {
      console.error('Error during signOut:', err);
    } finally {
      localStorage.removeItem('educonnect_token');
      localStorage.removeItem('educonnect_student');
      setCurrentUser(null);
      setStudentProfile(null);
    }
  };

  // Send Password Reset Email via Firebase Client SDK
  const sendPasswordReset = async (email) => {
    const trimmedEmail = (email || '').trim();
    if (!trimmedEmail) {
      return { success: false, message: 'Please enter your email address.' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return { success: false, message: 'Please provide a valid email address.' };
    }

    try {
      const authInstance = getFirebaseAuth();
      await sendPasswordResetEmail(authInstance, trimmedEmail);
      return { 
        success: true, 
        message: 'Password reset email sent. Please check your inbox.' 
      };
    } catch (error) {
      console.error('Firebase password reset error:', error);
      let userFriendlyMessage = 'Unable to send password reset email. Please try again.';

      if (error.code === 'auth/user-not-found') {
        // Do not expose unnecessary information about whether an account exists
        return {
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.'
        };
      } else if (error.code === 'auth/invalid-email') {
        userFriendlyMessage = 'Please provide a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        userFriendlyMessage = 'Too many requests. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        userFriendlyMessage = 'Network connection issue. Please check your internet connection and try again.';
      } else if (error.message) {
        userFriendlyMessage = error.message;
      }

      return { success: false, message: userFriendlyMessage };
    }
  };

  // Update Profile
  const updateProfile = async (profileData) => {
    try {
      if (!auth || !auth.currentUser) {
        throw new Error('You must be signed in to update your profile.');
      }
      const idToken = await auth.currentUser.getIdToken();

      const res = await api.post('/student/profile', profileData, {
        headers: { Authorization: `Bearer ${idToken}` }
      });

      const updated = res.data.student;
      setStudentProfile(updated);
      localStorage.setItem('educonnect_student', JSON.stringify(updated));
      return { success: true, student: updated };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || error.message || 'Profile update failed.' 
      };
    }
  };

  // Re-fetch current student profile from backend
  const refreshStudentProfile = async () => {
    try {
      if (!auth || !auth.currentUser) return null;
      const idToken = await auth.currentUser.getIdToken();
      const res = await api.get('/student/profile', {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.data) {
        setStudentProfile(res.data);
        localStorage.setItem('educonnect_student', JSON.stringify(res.data));
        return res.data;
      }
    } catch (err) {
      console.warn('Failed refreshing student profile:', err.message);
    }
    return null;
  };

  // Determine if current user has administrative permissions (aligned with server/src/middleware/authMiddleware.js)
  const userEmail = (currentUser?.email || studentProfile?.email || '').toLowerCase();
  const configuredAdminEmails = ['admin@educonnect.ac.in', 'admin@educonnect.com'];
  const isAdmin = Boolean(
    studentProfile?.role === 'admin' ||
    (userEmail && (
      configuredAdminEmails.includes(userEmail) ||
      userEmail.endsWith('@admin.educonnect.internal')
    ))
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        studentProfile,
        isAdmin,
        loading,
        authError,
        registerStudent,
        loginStudent,
        logoutStudent,
        sendPasswordReset,
        updateProfile,
        refreshStudentProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
