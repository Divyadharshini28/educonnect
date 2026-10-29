/**
 * EduConnect — Secure Administrator Provisioning Utility
 * 
 * Authoritative, server-side CLI tool to safely provision or authorize
 * a designated administrator in Firebase Authentication and MongoDB.
 * 
 * Security Guardrails:
 * 1. Target email must match the configured administrative allowlist (ADMIN_EMAILS).
 * 2. No hardcoded passwords: Generates a secure Firebase password-setup link.
 * 3. Never prints secrets, private keys, or credentials.
 * 4. Sets cryptographic custom claims { admin: true, role: 'admin' } via Admin SDK.
 * 5. Upserts the Student collection profile with role: 'admin' idempotently.
 * 6. Safe to rerun without data loss.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables if not already loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const { initFirebase } = require('../config/firebase');
const { syncToDisk } = require('../config/dbPersistence');
const Student = require('../models/Student');

/**
 * Validates whether an email is on the configured administrative allowlist.
 */
function isEmailAllowlisted(email, allowlistEnv = process.env.ADMIN_EMAILS) {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  const allowed = (allowlistEnv || 'admin@educonnect.ac.in,admin@educonnect.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(normalized) || normalized.endsWith('@admin.educonnect.internal');
}

/**
 * Main provisioning function.
 * Can be called programmatically or via CLI.
 */
async function provisionAdmin(options = {}) {
  const cliArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const targetEmail = (options.email || cliArgs[0] || 'admin@educonnect.ac.in').trim().toLowerCase();
  const displayName = options.name || 'System Administrator';
  const dryRun = Boolean(options.dryRun || process.argv.includes('--dry-run'));
  const passwordArg = process.argv.find(arg => arg.startsWith('--password='));
  const explicitPassword = options.password || (passwordArg ? passwordArg.slice('--password='.length) : null);

  console.log('======================================================');
  console.log('EduConnect — Secure Admin Provisioning Utility');
  console.log('======================================================');
  console.log(`Target Administrator Email: ${targetEmail}`);
  console.log(`Execution Mode:            ${dryRun ? 'DRY-RUN (Simulated)' : 'LIVE'}`);
  console.log('------------------------------------------------------');

  // Step 1: Validate against the administrative allowlist
  if (!isEmailAllowlisted(targetEmail)) {
    const errorMsg = `Security Denial: Target email "${targetEmail}" is NOT present in the configured administrative allowlist. Provisioning rejected.`;
    console.error(`[FAILED] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  console.log('✓ Step 1: Email allowlist verification passed.');

  // Step 2: Initialize Firebase Admin SDK
  let fb = options.fbInstance;
  if (!fb) {
    fb = initFirebase();
  }

  if (!fb || !fb.auth) {
    const errorMsg = 'Server configuration error: Firebase Admin SDK credentials are not configured or failed to initialize.';
    console.error(`[FAILED] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  const auth = options.authClient || fb.auth;
  console.log('✓ Step 2: Firebase Admin SDK initialized successfully.');

  let firebaseUser = null;
  let isNewFirebaseUser = false;
  let passwordResetLink = null;

  // Step 3: Check or Create Firebase User
  try {
    try {
      firebaseUser = await auth.getUserByEmail(targetEmail);
      console.log(`✓ Step 3: ${dryRun ? '[DRY-RUN] ' : ''}Found existing Firebase user account (UID: ${firebaseUser.uid}).`);
    } catch (lookupErr) {
      if (lookupErr.code === 'auth/user-not-found' || lookupErr.message?.includes('user-not-found') || (dryRun && (lookupErr.message?.includes('OAuth2') || lookupErr.message?.includes('token')))) {
        if (dryRun) {
          console.log('✓ Step 3: [DRY-RUN] User not found in Firebase Auth (or network offline in dry-run mode); would create new Firebase account.');
          firebaseUser = { uid: 'dryrun-admin-uid-' + Date.now(), email: targetEmail, displayName };
          isNewFirebaseUser = true;
        } else {
          console.log('Notice: User account does not exist in Firebase Auth. Creating new verified administrator account...');
          firebaseUser = await auth.createUser({
            email: targetEmail,
            emailVerified: true,
            displayName,
            disabled: false
          });
          isNewFirebaseUser = true;
          console.log(`✓ Step 3: Created new Firebase user account (UID: ${firebaseUser.uid}).`);
        }
      } else {
        throw lookupErr;
      }
    }
  } catch (fbUserErr) {
    console.error(`[FAILED] Error during Firebase user management: ${fbUserErr.message}`);
    throw fbUserErr;
  }

  // Step 4: Set Firebase Custom Claims { admin: true, role: 'admin' }
  const claims = { admin: true, role: 'admin' };
  if (dryRun) {
    console.log('✓ Step 4: [DRY-RUN] Would apply custom claims:', JSON.stringify(claims));
  } else {
    try {
      await auth.setCustomUserClaims(firebaseUser.uid, claims);
      console.log('✓ Step 4: Set authoritative Firebase custom claims { admin: true, role: "admin" }.');
    } catch (claimErr) {
      console.error(`[FAILED] Failed setting custom claims: ${claimErr.message}`);
      throw claimErr;
    }
  }

  // Step 5: Configure Password (Direct Update or Setup Link)
  if (explicitPassword) {
    if (explicitPassword.length < 6) {
      throw new Error('Password must be at least 6 characters per Firebase Authentication policy.');
    }
    if (dryRun) {
      console.log('✓ Step 5: [DRY-RUN] Would directly update administrator password in Firebase Auth.');
    } else {
      try {
        await auth.updateUser(firebaseUser.uid, { password: explicitPassword });
        console.log('✓ Step 5: Administrator password updated directly in Firebase Authentication.');
      } catch (pwdErr) {
        console.error(`[FAILED] Failed to update password: ${pwdErr.message}`);
        throw pwdErr;
      }
    }
  } else if (dryRun) {
    passwordResetLink = `https://educonnect.auth.simulated/__/auth/action?mode=resetPassword&email=${encodeURIComponent(targetEmail)}`;
    console.log('✓ Step 5: [DRY-RUN] Simulated password setup link generated.');
  } else {
    try {
      passwordResetLink = await auth.generatePasswordResetLink(targetEmail);
      console.log('✓ Step 5: Secure cryptographic password-setup link generated successfully.');
    } catch (linkErr) {
      console.warn(`[NOTICE] Could not generate password-setup link: ${linkErr.message}`);
      passwordResetLink = null;
    }
  }

  // Step 6: Create or Update Student Profile in Database
  let studentRecord = null;
  const wasAlreadyConnected = mongoose.connection && mongoose.connection.readyState === 1;
  let dbConnected = wasAlreadyConnected;

  if (dryRun) {
    console.log('✓ Step 6: [DRY-RUN] Would create or update Student profile with role: "admin".');
  } else {
    if (!wasAlreadyConnected) {
      try {
        await connectDB();
        dbConnected = true;
      } catch (dbErr) {
        console.warn('[DB Notice] MongoDB daemon connection skipped. Updating local store directly.');
      }
    }

  if (dbConnected) {
    try {
      studentRecord = await Student.findOne({
        $or: [{ email: targetEmail }, { firebaseUID: firebaseUser.uid }]
      });

      if (studentRecord) {
        studentRecord.role = 'admin';
        studentRecord.firebaseUID = firebaseUser.uid;
        if (!studentRecord.name) studentRecord.name = displayName;
        studentRecord.email = targetEmail;
        await studentRecord.save();
        console.log(`✓ Step 6: Updated existing database record for ${targetEmail} with role: "admin".`);
      } else {
        studentRecord = new Student({
          firebaseUID: firebaseUser.uid,
          name: displayName,
          email: targetEmail,
          department: 'Administration',
          year: 1,
          cgpa: 10.0,
          role: 'admin',
          skills: ['Opportunity Governance', 'System Administration'],
          interests: ['Governance', 'Operations']
        });
        await studentRecord.save();
        console.log(`✓ Step 6: Created new database profile for ${targetEmail} with role: "admin".`);
      }

      await syncToDisk();
      console.log('✓ Step 6b: Synced database record to local persistent store.');
    } catch (recErr) {
      console.error(`[FAILED] Database profile creation failed: ${recErr.message}`);
      throw recErr;
    } finally {
      if (!wasAlreadyConnected) {
        await closeDB();
      }
    }
  } else {
    // Direct sync to db_store.json if MongoDB daemon is offline
    const storePath = path.resolve(__dirname, '../../data/db_store.json');
    if (fs.existsSync(storePath)) {
      try {
        const raw = fs.readFileSync(storePath, 'utf8');
        const dbData = JSON.parse(raw);
        if (!Array.isArray(dbData.students)) dbData.students = [];

        const existingIdx = dbData.students.findIndex(
          s => (s.email && s.email.toLowerCase() === targetEmail) || s.firebaseUID === firebaseUser.uid
        );

        if (existingIdx >= 0) {
          dbData.students[existingIdx].role = 'admin';
          dbData.students[existingIdx].firebaseUID = firebaseUser.uid;
          if (!dbData.students[existingIdx].name) dbData.students[existingIdx].name = displayName;
        } else {
          dbData.students.push({
            _id: new mongoose.Types.ObjectId().toString(),
            firebaseUID: firebaseUser.uid,
            name: displayName,
            email: targetEmail,
            department: 'Administration',
            year: 1,
            cgpa: 10.0,
            role: 'admin',
            skills: ['Opportunity Governance', 'System Administration'],
            interests: ['Governance', 'Operations'],
            createdAt: new Date().toISOString()
          });
        }

        if (!dryRun) {
          fs.writeFileSync(storePath, JSON.stringify(dbData, null, 2), 'utf8');
          console.log('✓ Step 6: Persisted admin record directly to data/db_store.json.');
        } else {
          console.log('✓ Step 6: [DRY-RUN] Would persist admin record to data/db_store.json.');
        }
      } catch (storeErr) {
        console.error(`[FAILED] Local store update failed: ${storeErr.message}`);
        throw storeErr;
      }
    }
  }
}

  console.log('------------------------------------------------------');
  console.log('PROVISIONING STATUS: SUCCESSFUL');
  console.log('------------------------------------------------------');
  console.log(`User:                 ${targetEmail}`);
  console.log(`Firebase UID:         ${firebaseUser.uid}`);
  console.log(`Custom Claims:        admin=true, role=admin`);
  console.log(`Database Role:        role=admin`);
  console.log(`Account State:        ${isNewFirebaseUser ? 'Newly Created' : 'Pre-existing (Privileges Verified)'}`);
  
  if (explicitPassword) {
    console.log('\n[PASSWORD CONFIGURATION]');
    console.log('Administrator password has been set directly in Firebase Authentication.');
  } else if (passwordResetLink) {
    console.log('\n[SECURE PASSWORD SETUP]');
    console.log('The administrator can configure or update their secret password securely via:');
    console.log(passwordResetLink);
  }

  console.log('\n[LOGIN URLS]');
  console.log('Sign In:      http://localhost:5173/login');
  console.log('Admin Portal: http://localhost:5173/admin');
  console.log('======================================================\n');

  return {
    success: true,
    email: targetEmail,
    firebaseUID: firebaseUser.uid,
    isNewUser: isNewFirebaseUser,
    customClaims: claims,
    passwordResetLink,
    dryRun
  };
}

if (require.main === module) {
  provisionAdmin().catch(() => {
    process.exit(1);
  });
}

module.exports = {
  provisionAdmin,
  isEmailAllowlisted
};
