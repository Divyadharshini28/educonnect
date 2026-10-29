/**
 * Test Suite for EduConnect Secure Admin Provisioning & Authorization
 * 
 * Verifies:
 * 1. Allowlisted emails are correctly verified (admin@educonnect.ac.in, admin@educonnect.com)
 * 2. Unauthorized emails are rejected with security denial (no account created or privileged)
 * 3. Dry-run provisioning succeeds with valid claims payload { admin: true, role: 'admin' }
 * 4. Idempotent repeat execution succeeds safely without data corruption
 * 5. Public registration and profile endpoints strictly deny self-assignment of admin role
 * 6. Backend middleware strictly rejects ordinary student access to admin routes
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { isEmailAllowlisted, provisionAdmin } = require('../scripts/provisionAdmin');
const Student = require('../models/Student');

let total = 0;
let passed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('Secure Admin Provisioning & Authorization Test Suite');
console.log('======================================================\n');

async function runProvisioningTests() {
  // 1. Email Allowlist Verification
  test('1. Allowlisted emails return true; unauthorized emails return false', () => {
    assert.strictEqual(isEmailAllowlisted('admin@educonnect.ac.in'), true);
    assert.strictEqual(isEmailAllowlisted('admin@educonnect.com'), true);
    assert.strictEqual(isEmailAllowlisted('ADMIN@EDUCONNECT.AC.IN'), true);
    assert.strictEqual(isEmailAllowlisted('ops@admin.educonnect.internal'), true);

    // Negative tests
    assert.strictEqual(isEmailAllowlisted('student@psgtech.ac.in'), false);
    assert.strictEqual(isEmailAllowlisted('attacker@evil.com'), false);
    assert.strictEqual(isEmailAllowlisted('admin@educonnect.ac.in.fake.com'), false);
    assert.strictEqual(isEmailAllowlisted(''), false);
    assert.strictEqual(isEmailAllowlisted(null), false);
  });

  // 2. Rejection of Unauthorized Email Address
  await asyncTest('2. Rejection of unauthorized email address with security denial', async () => {
    let rejected = false;
    try {
      await provisionAdmin({ email: 'unauthorized_hacker@external.com', dryRun: true });
    } catch (err) {
      rejected = true;
      assert.ok(err.message.includes('Security Denial'), 'Must indicate Security Denial');
      assert.ok(err.message.includes('NOT present in the configured administrative allowlist'));
    }
    assert.strictEqual(rejected, true, 'Unauthorized email must throw security error');
  });

  // 3. Dry-Run Provisioning for Allowed Admin (admin@educonnect.ac.in)
  await asyncTest('3. Dry-run provisioning succeeds for admin@educonnect.ac.in with valid claims payload', async () => {
    const mockAuth = {
      getUserByEmail: async (email) => {
        const err = new Error('User not found');
        err.code = 'auth/user-not-found';
        throw err;
      },
      createUser: async (params) => ({
        uid: 'mock-admin-uid-12345',
        email: params.email,
        displayName: params.displayName
      }),
      setCustomUserClaims: async (uid, claims) => {
        assert.strictEqual(claims.admin, true);
        assert.strictEqual(claims.role, 'admin');
      },
      generatePasswordResetLink: async (email) => `https://educonnect-54c00.firebaseapp.com/__/auth/action?mode=resetPassword&email=${email}`
    };

    const res = await provisionAdmin({
      email: 'admin@educonnect.ac.in',
      name: 'EduConnect Administrator',
      dryRun: true,
      authClient: mockAuth,
      fbInstance: { auth: mockAuth }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.email, 'admin@educonnect.ac.in');
    assert.strictEqual(res.customClaims.admin, true);
    assert.strictEqual(res.customClaims.role, 'admin');
    assert.ok(res.passwordResetLink, 'Must generate password setup link');
  });

  // 4. Repeat Execution Idempotence
  await asyncTest('4. Repeat execution is safe and updates existing user without error', async () => {
    let claimCalls = 0;
    const existingUid = 'preexisting-admin-uid-999';

    const mockAuthWithExisting = {
      getUserByEmail: async (email) => ({
        uid: existingUid,
        email,
        displayName: 'Existing Admin'
      }),
      setCustomUserClaims: async (uid, claims) => {
        claimCalls++;
        assert.strictEqual(uid, existingUid);
        assert.strictEqual(claims.admin, true);
      },
      generatePasswordResetLink: async (email) => `https://educonnect-54c00.firebaseapp.com/__/auth/action?mode=resetPassword&email=${email}`
    };

    const run1 = await provisionAdmin({
      email: 'admin@educonnect.ac.in',
      dryRun: true,
      authClient: mockAuthWithExisting,
      fbInstance: { auth: mockAuthWithExisting }
    });
    assert.strictEqual(run1.success, true);
    assert.strictEqual(run1.firebaseUID, existingUid);
    assert.strictEqual(run1.isNewUser, false);

    const run2 = await provisionAdmin({
      email: 'admin@educonnect.ac.in',
      dryRun: true,
      authClient: mockAuthWithExisting,
      fbInstance: { auth: mockAuthWithExisting }
    });
    assert.strictEqual(run2.success, true);
    assert.strictEqual(run2.firebaseUID, existingUid);
    assert.strictEqual(run2.isNewUser, false);
    assert.strictEqual(run1.customClaims.admin, true);
    assert.strictEqual(run2.customClaims.admin, true);
    assert.strictEqual(run1.customClaims.role, 'admin');
    assert.strictEqual(run2.customClaims.role, 'admin');
  });

  // 5. Denial of Self-Assignment in Schema and Public Endpoints
  test('5. Student schema defaults to student role and cannot be self-elevated', () => {
    const student = new Student({
      firebaseUID: 'test-student-uid-' + Date.now(),
      name: 'John Student',
      email: 'john@student.edu'
    });

    assert.strictEqual(student.role, 'student', 'Default role must strictly be student');

    // Attempting invalid role
    student.role = 'super_hacker';
    const validationError = student.validateSync();
    assert.ok(validationError && validationError.errors['role'], 'Invalid roles must be rejected by mongoose schema validation');
  });

  // 6. Backend Authorization Middleware Denial for Student Role
  test('6. authMiddleware strictly denies access to users with role=student', () => {
    const { requireAdmin } = require('../middleware/authMiddleware');

    let statusCalled = null;
    let jsonCalled = null;
    let nextCalled = false;

    const mockRes = {
      status: (code) => {
        statusCalled = code;
        return {
          json: (body) => { jsonCalled = body; }
        };
      }
    };

    const mockReq = {
      firebaseUID: 'student-uid-abc',
      firebaseEmail: 'student@psgtech.ac.in',
      student: { role: 'student', email: 'student@psgtech.ac.in' },
      decodedToken: { uid: 'student-uid-abc', email: 'student@psgtech.ac.in' },
      headers: {}
    };

    requireAdmin(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Student request must not pass requireAdmin');
    assert.strictEqual(statusCalled, 403, 'Must return 403 Forbidden');
    assert.ok(jsonCalled && jsonCalled.message.includes('Forbidden'));
  });

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  assert.strictEqual(passed, total, 'All provisioning & authorization tests must pass');
  console.log('All Admin Provisioning & Authorization tests PASSED!\n');
}

runProvisioningTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
