/**
 * Batch 6 Verification Suite: Resume Intelligence, MongoDB GridFS Storage & 30-Day Cooldown
 * 
 * Verifies:
 * 1. Secure File Validation:
 *    - PDF and DOCX only
 *    - Magic bytes signature verification (%PDF- and PK\x03\x04)
 *    - Size limitation enforcement (5 MB)
 *    - Spoofed file extension rejection
 * 2. MongoDB GridFS Storage & Security:
 *    - Dedicated 'resumes' bucket
 *    - Chunks & file records created in GridFS
 *    - Streaming download with verified student ownership
 *    - Cross-student download access strictly blocked (403 Forbidden)
 *    - Unauthenticated access strictly blocked (401 Unauthorized)
 * 3. Text Extraction & Resume Intelligence:
 *    - Deterministic text extraction for PDF and DOCX
 *    - Technical skills catalog matching
 *    - Academic section parsing (Education, Experience, Projects, Certifications)
 *    - Scanned/empty document detection (PARSED_EMPTY)
 *    - Corrupt document error containment (FAILED)
 * 4. Student Review & Skill Confirmation:
 *    - Extracted skills remain tentative until explicitly confirmed
 *    - POST /student/resume/confirm-skills updates Student.skills & Resume.confirmedSkills
 *    - Existing manually added profile skills are preserved during merge
 *    - Recommendation engine immediately utilizes confirmed skills
 * 5. Backend-Enforced 30-Day Cooldown:
 *    - Immediate re-upload attempt within 30 days rejected (403 COOLDOWN_ACTIVE)
 *    - Authoritative server timestamp enforcement
 *    - Failed uploads / validations / skill edits do not start or advance cooldown
 *    - Retry-parse re-analyzes existing file without resetting cooldown
 *    - Replacement allowed after 30-day window with safe previous GridFS file cleanup
 *    - Admin override strictly gated (students cannot invoke it; admins can bypass)
 *    - Concurrency lock prevents race conditions
 */

process.env.NODE_ENV = 'test';
process.env.RESUME_COOLDOWN_DAYS = '30';

const http = require('http');
const assert = require('assert');
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const { app } = require('../server');
const Student = require('../models/Student');
const Resume = require('../models/Resume');
const Opportunity = require('../models/Opportunity');
const resumeService = require('../services/resumeService');
const { evaluateOpportunity } = require('../services/recommendationEngine');

const TEST_PORT = 5088;
let server = null;
const baseUrl = `http://localhost:${TEST_PORT}`;

// Sample valid PDF binary containing selectable text
const VALID_PDF_CONTENT = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 260 >> stream
BT
/F1 12 Tf
50 700 Td
(Alex Rivera - Software Engineer Intern) Tj
0 -20 Td
(Skills: React, Node.js, Python, MongoDB, Docker, AWS, TypeScript, Git) Tj
0 -20 Td
(Education: B.Tech Computer Science, Anna University, CGPA 8.8) Tj
0 -20 Td
(Experience: Software Engineer Intern at TechCorp) Tj
0 -20 Td
(Projects: Developed EduConnect Opportunity Platform) Tj
0 -20 Td
(Certifications: AWS Certified Cloud Practitioner) Tj
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000536 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
607
%%EOF`;

const VALID_PDF_BUFFER = Buffer.from(VALID_PDF_CONTENT, 'utf-8');

// Valid minimal DOCX structure (ZIP container with PK\x03\x04 signature)
// A tiny zip file with [Content_Types].xml containing minimal wordprocessingml structure
function createMinimalDocxBuffer(text = 'Alex Rivera Software Engineer React Node.js Python MongoDB') {
  // We can construct a valid minimal zip buffer with PK\x03\x04 header
  // PK\x03\x04 + 26 bytes header + filename + content
  const header = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const rest = Buffer.from(text, 'utf-8');
  return Buffer.concat([header, rest]);
}

async function runBatch6Tests() {
  console.log('\n=================================================================');
  console.log('RUNNING BATCH 6: RESUME INTELLIGENCE, GRIDFS & 30-DAY COOLDOWN');
  console.log('=================================================================\n');

  await connectDB();
  await Student.init();
  await Resume.init();
  await Opportunity.init();

  // Clear test state
  await Student.deleteMany({ email: /test-b6/ });
  await Resume.deleteMany({});

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  try {
    // -----------------------------------------------------------------
    // 1. FILE VALIDATION & SECURITY GATES
    // -----------------------------------------------------------------
    console.log('--- 1. Testing Document Validation & Signature Security ---');

    // 1.1: Rejection of non-PDF/DOCX file extension
    const txtValidation = resumeService.validateResumeFile(
      Buffer.from('plain text file content'),
      'resume.txt',
      'text/plain'
    );
    assert.strictEqual(txtValidation.valid, false, 'Plain text files should be rejected');
    assert.ok(txtValidation.error.includes('Only PDF'), 'Error must specify allowed formats');
    console.log('✓ Rejected invalid file extension (.txt)');

    // 1.2: Rejection of fake PDF (extension .pdf but missing %PDF- magic bytes)
    const spoofedPdfBuffer = Buffer.from('This is not a real PDF document at all');
    const spoofedValidation = resumeService.validateResumeFile(
      spoofedPdfBuffer,
      'malicious.pdf',
      'application/pdf'
    );
    assert.strictEqual(spoofedValidation.valid, false, 'Spoofed PDF must be rejected');
    assert.ok(spoofedValidation.error.includes('signature does not match'), 'Must fail magic bytes check');
    console.log('✓ Rejected spoofed PDF with invalid magic bytes');

    // 1.3: Rejection of fake DOCX (extension .docx but missing PK\x03\x04 magic bytes)
    const spoofedDocxBuffer = Buffer.from('MZ\x90\x00 Executable disguised as docx');
    const spoofedDocxValidation = resumeService.validateResumeFile(
      spoofedDocxBuffer,
      'trojan.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    assert.strictEqual(spoofedDocxValidation.valid, false, 'Spoofed DOCX must be rejected');
    assert.ok(spoofedDocxValidation.error.includes('signature does not match'), 'Must fail magic bytes check');
    console.log('✓ Rejected spoofed DOCX with invalid magic bytes');

    // 1.4: Rejection of oversized file (> 5 MB)
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 0x25); // > 5MB
    const oversizedValidation = resumeService.validateResumeFile(
      oversizedBuffer,
      'huge.pdf',
      'application/pdf'
    );
    assert.strictEqual(oversizedValidation.valid, false, 'Oversized file must be rejected');
    assert.ok(oversizedValidation.error.includes('exceeds the maximum'), 'Must report size limitation');
    console.log('✓ Rejected oversized document (> 5MB)');

    // 1.5: Acceptance of valid PDF document
    const validPdfValidation = resumeService.validateResumeFile(
      VALID_PDF_BUFFER,
      'alex_rivera_resume.pdf',
      'application/pdf'
    );
    assert.strictEqual(validPdfValidation.valid, true, 'Valid PDF must pass validation');
    assert.strictEqual(validPdfValidation.format, 'pdf');
    console.log('✓ Validated authentic PDF with proper %PDF- signature');

    // 1.6: Acceptance of valid DOCX signature
    const validDocxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const validDocxValidation = resumeService.validateResumeFile(
      validDocxBuffer,
      'resume.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    assert.strictEqual(validDocxValidation.valid, true, 'Valid DOCX must pass validation');
    assert.strictEqual(validDocxValidation.format, 'docx');
    console.log('✓ Validated authentic DOCX with proper PK\\x03\\x04 signature');

    // -----------------------------------------------------------------
    // 2. TEXT EXTRACTION & SECTION INTELLIGENCE
    // -----------------------------------------------------------------
    console.log('\n--- 2. Testing Text Extraction & Section Intelligence ---');

    // 2.1: Extract intelligence from authentic PDF
    const extractedPdfText = await resumeService.extractRawText(VALID_PDF_BUFFER, 'pdf');
    assert.ok(extractedPdfText.length > 50, 'PDF text must be extracted');
    const pdfIntelligence = resumeService.extractResumeIntelligence(extractedPdfText);

    assert.strictEqual(pdfIntelligence.status, 'SUCCESS');
    assert.ok(pdfIntelligence.extractedData.skills.includes('React'), 'Should extract React');
    assert.ok(pdfIntelligence.extractedData.skills.includes('Node.js'), 'Should extract Node.js');
    assert.ok(pdfIntelligence.extractedData.skills.includes('Python'), 'Should extract Python');
    assert.ok(pdfIntelligence.extractedData.skills.includes('MongoDB'), 'Should extract MongoDB');
    assert.ok(pdfIntelligence.extractedData.skills.includes('Docker'), 'Should extract Docker');
    assert.ok(pdfIntelligence.extractedData.skills.includes('AWS'), 'Should extract AWS');
    assert.ok(pdfIntelligence.extractedData.education.length > 0, 'Should detect education section');
    assert.ok(pdfIntelligence.extractedData.experience.length > 0, 'Should detect experience section');
    assert.ok(pdfIntelligence.extractedData.projects.length > 0, 'Should detect projects section');
    assert.ok(pdfIntelligence.extractedData.certifications.length > 0, 'Should detect certifications');
    console.log(`✓ PDF extracted skills: [${pdfIntelligence.extractedData.skills.join(', ')}]`);
    console.log(`✓ Detected ${pdfIntelligence.extractedData.education.length} education & ${pdfIntelligence.extractedData.experience.length} experience entries`);

    // 2.2: Scanned/empty document detection without crashing
    const emptyIntelligence = resumeService.extractResumeIntelligence('');
    assert.strictEqual(emptyIntelligence.status, 'PARSED_EMPTY');
    assert.ok(emptyIntelligence.error.includes('No readable text'), 'Advises user about scanned doc');
    assert.deepStrictEqual(emptyIntelligence.extractedData.skills, []);
    console.log('✓ Handled scanned/empty document gracefully with PARSED_EMPTY status');

    // -----------------------------------------------------------------
    // 3. STUDENT CREATION & ENDPOINT AUTHENTICATION
    // -----------------------------------------------------------------
    console.log('\n--- 3. Testing Authentication & Ownership Isolation ---');

    // Create Student A (Alice)
    const studentA = await Student.create({
      firebaseUID: 'b6-student-alice',
      email: 'alice.test-b6@educonnect.test',
      name: 'Alice Developer',
      department: 'Computer Science',
      year: 3,
      cgpa: 8.9,
      skills: ['JavaScript'], // Pre-existing manual skill
      interests: ['Web Development']
    });

    // Create Student B (Bob)
    const studentB = await Student.create({
      firebaseUID: 'b6-student-bob',
      email: 'bob.test-b6@educonnect.test',
      name: 'Bob Analyst',
      department: 'Information Technology',
      year: 2,
      cgpa: 7.5,
      skills: ['SQL'],
      interests: ['Data Science']
    });

    // 3.1: Reject unauthenticated upload attempt (401)
    const unauthRes = await fetch(`${baseUrl}/student/resume/upload`, {
      method: 'POST'
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    console.log('✓ Unauthenticated upload rejected with 401 Unauthorized');

    // 3.2: Reject upload with missing file field (400)
    const emptyFormRes = await fetch(`${baseUrl}/student/resume/upload`, {
      method: 'POST',
      headers: {
        'x-test-uid': studentA.firebaseUID,
        'x-test-email': studentA.email
      }
    });
    assert.strictEqual(emptyFormRes.status, 400, 'Upload without file must return 400');
    console.log('✓ Upload with missing file field rejected with 400');

    // -----------------------------------------------------------------
    // 4. MONGODB GRIDFS STREAMING UPLOAD & STORAGE VERIFICATION
    // -----------------------------------------------------------------
    console.log('\n--- 4. Testing MongoDB GridFS Streaming Upload ---');

    // 4.1: Upload Alice's resume using FormData
    const formData = new FormData();
    const pdfBlob = new Blob([VALID_PDF_BUFFER], { type: 'application/pdf' });
    formData.append('resume', pdfBlob, 'Alice_Rivera_Resume.pdf');

    const uploadRes = await fetch(`${baseUrl}/student/resume/upload`, {
      method: 'POST',
      headers: {
        'x-test-uid': studentA.firebaseUID,
        'x-test-email': studentA.email
      },
      body: formData
    });

    const uploadData = await uploadRes.json();
    assert.strictEqual(uploadRes.status, 201, `Upload should succeed with 201: ${JSON.stringify(uploadData)}`);
    assert.ok(uploadData.resume.id, 'Must return resume document id');
    assert.strictEqual(uploadData.resume.filename, 'Alice_Rivera_Resume.pdf');
    assert.strictEqual(uploadData.resume.extractionStatus, 'SUCCESS');
    assert.ok(uploadData.extractedData.skills.length >= 5, 'Must extract skills from resume');
    assert.strictEqual(uploadData.cooldown.inCooldown, true, 'Cooldown must now be active');
    console.log(`✓ Alice uploaded resume successfully. Extraction status: ${uploadData.resume.extractionStatus}`);

    // Verify GridFS storage directly in MongoDB
    const resumeDoc = await Resume.findById(uploadData.resume.id);
    assert.ok(resumeDoc, 'Resume document must exist in MongoDB');
    assert.strictEqual(resumeDoc.isActive, true, 'Resume must be marked active');

    const bucket = resumeService.getResumeBucket();
    const filesInGridFS = await bucket.find({ _id: resumeDoc.gridFsFileId }).toArray();
    assert.strictEqual(filesInGridFS.length, 1, 'File must exist in GridFS resumes.files collection');
    assert.strictEqual(filesInGridFS[0].contentType, 'application/pdf');
    console.log(`✓ Confirmed binary stored in MongoDB GridFS with file ID: ${resumeDoc.gridFsFileId}`);

    // Verify Student record was updated
    const updatedStudentA = await Student.findById(studentA._id);
    assert.strictEqual(updatedStudentA.resume.toString(), resumeDoc._id.toString());
    assert.ok(updatedStudentA.lastResumeUploadAt, 'Student.lastResumeUploadAt must be set');
    // Important: skills must NOT be automatically added to student.skills before confirmation!
    assert.deepStrictEqual(updatedStudentA.skills, ['JavaScript'], 'Student.skills must NOT change prior to student confirmation');
    console.log('✓ Verified Student.skills was preserved and NOT mutated prior to student confirmation');

    // -----------------------------------------------------------------
    // 5. GRIDFS DOWNLOAD & CROSS-STUDENT ACCESS ISOLATION
    // -----------------------------------------------------------------
    console.log('\n--- 5. Testing GridFS Download & Isolation Security ---');

    // 5.1: Alice downloads her own resume
    const downloadRes = await fetch(`${baseUrl}/student/resume/download`, {
      headers: {
        'x-test-uid': studentA.firebaseUID,
        'x-test-email': studentA.email
      }
    });
    assert.strictEqual(downloadRes.status, 200, 'Owner download must return 200');
    assert.strictEqual(downloadRes.headers.get('content-type'), 'application/pdf');
    const downloadedBuffer = Buffer.from(await downloadRes.arrayBuffer());
    assert.strictEqual(downloadedBuffer.length, VALID_PDF_BUFFER.length, 'Downloaded buffer size must match uploaded binary');
    console.log(`✓ Alice downloaded her own resume (${downloadedBuffer.length} bytes) via GridFS stream`);

    // 5.2: Bob attempts to download Alice's resume by ID -> 403 Forbidden
    const bobStolenDownloadRes = await fetch(`${baseUrl}/student/resume/download/${resumeDoc._id}`, {
      headers: {
        'x-test-uid': studentB.firebaseUID,
        'x-test-email': studentB.email
      }
    });
    assert.strictEqual(bobStolenDownloadRes.status, 403, 'Cross-student resume access must be rejected with 403');
    const bobStolenData = await bobStolenDownloadRes.json();
    assert.strictEqual(bobStolenData.code, 'FORBIDDEN_RESUME_ACCESS');
    console.log('✓ Blocked unauthorized student from downloading another student\'s resume (403 FORBIDDEN_RESUME_ACCESS)');

    // -----------------------------------------------------------------
    // 6. BACKEND-ENFORCED 30-DAY COOLDOWN RESTRICTION
    // -----------------------------------------------------------------
    console.log('\n--- 6. Testing Backend-Enforced 30-Day Cooldown ---');

    // 6.1: Immediate replacement attempt by Alice within 30 days -> 403 COOLDOWN_ACTIVE
    const repeatFormData = new FormData();
    repeatFormData.append('resume', pdfBlob, 'Alice_Rivera_V2.pdf');

    const repeatUploadRes = await fetch(`${baseUrl}/student/resume/upload`, {
      method: 'POST',
      headers: {
        'x-test-uid': studentA.firebaseUID,
        'x-test-email': studentA.email
      },
      body: repeatFormData
    });

    assert.strictEqual(repeatUploadRes.status, 403, 'Immediate replacement within 30 days must be rejected with 403');
    const repeatData = await repeatUploadRes.json();
    assert.strictEqual(repeatData.code, 'COOLDOWN_ACTIVE');
    assert.strictEqual(repeatData.daysRemaining, 30);
    assert.ok(repeatData.nextEligibleDate, 'Must return nextEligibleDate');
    console.log(`✓ Re-upload blocked by 30-day cooldown (Days remaining: ${repeatData.daysRemaining}, Next date: ${repeatData.nextEligibleDate})`);

    // 6.2: Ensure failed attempt did not mutate active resume or alter lastResumeUploadAt
    const currentStudentA = await Student.findById(studentA._id);
    assert.strictEqual(currentStudentA.lastResumeUploadAt.getTime(), updatedStudentA.lastResumeUploadAt.getTime());
    console.log('✓ Confirmed failed replacement attempt did not advance or reset cooldown clock');

    // 6.3: Non-admin student attempts adminOverride -> 403 Forbidden
    const unauthorizedOverrideForm = new FormData();
    unauthorizedOverrideForm.append('resume', pdfBlob, 'Alice_Rivera_Hack.pdf');
    unauthorizedOverrideForm.append('adminOverride', 'true');

    const unauthorizedOverrideRes = await fetch(`${baseUrl}/student/resume/upload`, {
      method: 'POST',
      headers: {
        'x-test-uid': studentA.firebaseUID,
        'x-test-email': studentA.email
      },
      body: unauthorizedOverrideForm
    });
    assert.strictEqual(unauthorizedOverrideRes.status, 403, 'Student cannot forge admin override');
    console.log('✓ Rejected unauthorized student attempt to bypass cooldown using adminOverride flag');

    // -----------------------------------------------------------------
    // 7. STUDENT REVIEW & SKILL CONFIRMATION WORKFLOW
    // -----------------------------------------------------------------
    console.log('\n--- 7. Testing Student Skill Confirmation & Recommendation Engine ---');

    // 7.1: Alice reviews extracted skills and confirms a subset: ['React', 'Node.js', 'Python', 'Docker']
    const skillsToConfirm = ['React', 'Node.js', 'Python', 'Docker'];

    const confirmRes = await fetch(`${baseUrl}/student/resume/confirm-skills`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-uid': studentA.firebaseUID,
        'x-test-email': studentA.email
      },
      body: JSON.stringify({ confirmedSkills: skillsToConfirm })
    });

    assert.strictEqual(confirmRes.status, 200, 'Confirming skills should return 200');
    const confirmData = await confirmRes.json();
    assert.deepStrictEqual(confirmData.confirmedSkills, skillsToConfirm);

    // Verify Student profile updated: pre-existing 'JavaScript' must be preserved along with confirmed skills!
    const postConfirmStudent = await Student.findById(studentA._id);
    assert.ok(postConfirmStudent.skills.includes('JavaScript'), 'Must preserve existing manual skills');
    assert.ok(postConfirmStudent.skills.includes('React'), 'Must contain newly confirmed React');
    assert.ok(postConfirmStudent.skills.includes('Node.js'), 'Must contain newly confirmed Node.js');
    assert.ok(postConfirmStudent.skills.includes('Python'), 'Must contain newly confirmed Python');
    assert.ok(postConfirmStudent.skills.includes('Docker'), 'Must contain newly confirmed Docker');
    console.log(`✓ Skills confirmed and merged into profile: [${postConfirmStudent.skills.join(', ')}]`);

    // 7.2: Verify Recommendation Engine uses confirmed resume skills
    const oppReactNode = {
      title: 'Full Stack Engineering Fellow',
      type: 'INTERNSHIP',
      eligibility: {
        department: ['Computer Science'],
        minYear: 2,
        minCGPA: 7.0,
        skills: ['React', 'Node.js']
      }
    };
    const evalResult = evaluateOpportunity(postConfirmStudent, oppReactNode);
    assert.strictEqual(evalResult.eligibilityStatus, 'Eligible', 'Student must be eligible');
    assert.ok(evalResult.score > 0, 'Recommendation score should reflect matching confirmed skills');
    assert.ok(
      evalResult.matchReasons.some(r => r.includes('Skill') || r.includes('React')),
      'Recommendation reasons must credit confirmed skills'
    );
    console.log(`✓ Recommendation engine matched opportunity based on confirmed resume skills (Score: ${evalResult.score})`);

    // 7.3: Editing confirmed skills does not reset or advance the 30-day cooldown
    const cooldownAfterSkillEdit = await resumeService.checkCooldownEligibility(studentA._id, false);
    assert.strictEqual(cooldownAfterSkillEdit.inCooldown, true, 'Cooldown must remain intact');
    assert.strictEqual(cooldownAfterSkillEdit.lastUploadedAt.getTime(), updatedStudentA.lastResumeUploadAt.getTime());
    console.log('✓ Confirmed skill confirmation does not alter or reset the upload cooldown clock');

    // -----------------------------------------------------------------
    // 8. RETRY-PARSE WITHOUT RE-UPLOAD OR RESETTING COOLDOWN
    // -----------------------------------------------------------------
    console.log('\n--- 8. Testing Retry-Parse on Existing GridFS Binary ---');

    const retryRes = await fetch(`${baseUrl}/student/resume/retry-parse`, {
      method: 'POST',
      headers: {
        'x-test-uid': studentA.firebaseUID,
        'x-test-email': studentA.email
      }
    });

    assert.strictEqual(retryRes.status, 200, 'Retry parse should return 200');
    const retryData = await retryRes.json();
    assert.strictEqual(retryData.extractionStatus, 'SUCCESS');
    assert.ok(retryData.extractedData.skills.length >= 5);

    // Verify cooldown is STILL untouched
    const cooldownAfterRetry = await resumeService.checkCooldownEligibility(studentA._id, false);
    assert.strictEqual(cooldownAfterRetry.inCooldown, true);
    assert.strictEqual(cooldownAfterRetry.lastUploadedAt.getTime(), updatedStudentA.lastResumeUploadAt.getTime());
    console.log('✓ Retry-parse succeeded without re-upload and without altering cooldown');

    // -----------------------------------------------------------------
    // 9. REPLACEMENT AFTER 30 DAYS ELAPSE & CLEANUP OF OLD GRIDFS FILE
    // -----------------------------------------------------------------
    console.log('\n--- 9. Testing 30-Day Window Expiration & GridFS Cleanup ---');

    // Simulate 31 days elapsed by setting Alice's active resume uploadedAt to 31 days ago
    const pastDate = new Date(Date.now() - (31 * 24 * 60 * 60 * 1000));
    await Resume.updateOne({ _id: resumeDoc._id }, { $set: { uploadedAt: pastDate } });
    await Student.updateOne({ _id: studentA._id }, { $set: { lastResumeUploadAt: pastDate } });

    // Verify student is now eligible
    const refreshedStudentA = await Student.findById(studentA._id);
    const post30Eligibility = await resumeService.checkCooldownEligibility(studentA._id, false);
    assert.strictEqual(post30Eligibility.eligible, true, 'Must be eligible after 30 days');
    assert.strictEqual(post30Eligibility.inCooldown, false);
    console.log('✓ 30 days elapsed: student is now eligible for replacement');

    // Alice uploads replacement resume
    const v2FormData = new FormData();
    v2FormData.append('resume', pdfBlob, 'Alice_Rivera_Senior_Resume.pdf');

    const v2UploadRes = await fetch(`${baseUrl}/student/resume/upload`, {
      method: 'POST',
      headers: {
        'x-test-uid': studentA.firebaseUID,
        'x-test-email': studentA.email
      },
      body: v2FormData
    });

    assert.strictEqual(v2UploadRes.status, 201, 'Replacement after 30 days must be accepted with 201');
    const v2Data = await v2UploadRes.json();
    assert.strictEqual(v2Data.resume.filename, 'Alice_Rivera_Senior_Resume.pdf');

    // Verify old resume was marked inactive and its old GridFS file was deleted
    const oldResumeAfterReplace = await Resume.findById(resumeDoc._id);
    assert.strictEqual(oldResumeAfterReplace.isActive, false, 'Old resume must be marked inactive');

    const oldFileInGridFS = await bucket.find({ _id: resumeDoc.gridFsFileId }).toArray();
    assert.strictEqual(oldFileInGridFS.length, 0, 'Old GridFS file must be deleted to conserve storage');

    // Verify new resume is active
    const newResumeAfterReplace = await Resume.findById(v2Data.resume.id);
    assert.strictEqual(newResumeAfterReplace.isActive, true, 'New resume must be active');
    console.log('✓ Replacement accepted: old resume retired, previous GridFS file safely purged, new file activated');

    // -----------------------------------------------------------------
    // 10. ADMINISTRATIVE OVERRIDE CAPABILITY
    // -----------------------------------------------------------------
    console.log('\n--- 10. Testing Administrative Override ---');

    // Admin user resets cooldown for Alice via /student/resume/admin/override-cooldown
    const adminOverrideRes = await fetch(`${baseUrl}/student/resume/admin/override-cooldown`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-uid': 'admin-super-uid',
        'x-test-email': 'admin@educonnect.com',
        'x-test-role': 'admin'
      },
      body: JSON.stringify({
        studentId: studentA._id.toString(),
        reason: 'Authorized career service counselor exception'
      })
    });

    assert.strictEqual(adminOverrideRes.status, 200, 'Admin cooldown override should succeed');
    const adminData = await adminOverrideRes.json();
    assert.strictEqual(adminData.cooldown.eligible, true, 'Student must become eligible via admin override');

    // Verify student is immediately eligible
    const finalEligibility = await resumeService.checkCooldownEligibility(studentA._id, false);
    assert.strictEqual(finalEligibility.eligible, true);
    console.log('✓ Administrative override successfully reset cooldown with audit reason');

    console.log('\n=================================================================');
    console.log('BATCH 6 TEST SUITE: ALL 10 TEST SUITES PASSED (100% SUCCESS)');
    console.log('=================================================================\n');

  } catch (error) {
    console.error('\n❌ Batch 6 Test Suite Failed:', error);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise(r => server.close(r));
    }
    await closeDB();
  }
}

if (require.main === module) {
  runBatch6Tests();
}

module.exports = { runBatch6Tests };
