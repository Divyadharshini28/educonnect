# EduConnect Batch 6: Resume Intelligence, MongoDB GridFS Storage & 30-Day Replacement Restriction

## 1. Executive Summary

Batch 6 introduces an enterprise-grade, secure resume processing and intelligence architecture into the **EduConnect** platform.

### Fixed Architectural Principles:
1. **Firebase Authentication for Identity Only**: All student operations derive the authenticated user identity strictly from verified Firebase ID tokens (`req.student`), never trusting client-supplied identifiers.
2. **MongoDB GridFS for Binary Storage**: Original PDF and DOCX files are streamed directly into a dedicated MongoDB GridFS bucket (`resumes`), completely avoiding third-party cloud file providers (e.g., Firebase Storage, AWS S3) and preventing MongoDB document size bloat (zero raw Base64 strings in documents).
3. **Structured Resume Metadata & Intelligence**: Metadata, extracted text previews, detected sections, and parsed skills are stored in a dedicated `Resume` MongoDB collection with references on `Student`.
4. **Backend-Enforced 30-Day Cooldown**: Resume replacement is strictly restricted to once every 30 days via trusted server-side timestamps. Failed uploads, validation errors, or skill edits never alter the cooldown clock.
5. **Student-Confirmed Skills Only for Recommendations**: Extracted skills remain tentative until the student explicitly reviews and confirms them. Confirmed skills merge seamlessly with existing manual profile skills and immediately boost recommendation scoring.

---

## 2. Architecture & Data Flow

```mermaid
flowchart TD
    Client[Student Browser / ProfilePage] -->|POST /student/resume/upload (PDF/DOCX)| Multer[Multer Memory Stream]
    Multer --> Validation[MIME & Magic Bytes Validator]
    Validation -->|Reject if !PDF/!DOCX or > 5MB| Err400[HTTP 400 / 413]
    Validation --> CooldownCheck[Backend 30-Day Cooldown Check]
    CooldownCheck -->|< 30 Days & !AdminOverride| Err403[HTTP 403 COOLDOWN_ACTIVE]
    CooldownCheck -->|Eligible| GridFS[MongoDB GridFS 'resumes' Bucket]
    GridFS --> StreamOut[resumes.files & resumes.chunks]
    GridFS --> Extract[Text Extraction: pdf-parse / mammoth]
    Extract --> Parser[Skill & Section Intelligence Parser]
    Parser --> ResumeDoc[MongoDB Resume Document (isActive: true)]
    ResumeDoc --> RetireOld[Retire Prior Active Resume & Purge Old GridFS Binary]
    ResumeDoc --> UpdateStudent[Update Student.resume & Student.lastResumeUploadAt]
    UpdateStudent --> ClientResponse[HTTP 201: Metadata + Extracted Intelligence + Cooldown]
    ClientResponse --> ReviewUI[Review Extracted Skills in UI]
    ReviewUI -->|POST /student/resume/confirm-skills| Confirm[Merge Skills into Student.skills]
    Confirm --> RecEngine[Recommendation Engine Immediately Uses Confirmed Skills]
```

---

## 3. Storage Implementation: MongoDB GridFS

### Bucket Name: `resumes`
- Managed natively using `mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'resumes' })`.
- Original documents are chunked across `resumes.chunks` (255 KB per chunk) with metadata indexed in `resumes.files`.
- **Zero Document Bloat**: No raw binary or Base64 payloads exist inside regular MongoDB documents.
- **Automatic Storage Optimization**: When a student replaces their resume after the 30-day cooldown, the old GridFS file is safely deleted to avoid database storage leaks.
- **Fail-Safe Cleanup**: If metadata persistence fails during an upload transaction, any created GridFS file is immediately pruned.

---

## 4. Document Security & Signature Verification

Files are verified on multiple tiers before hitting storage or parser engines:

| Security Gate | Enforcement Rule | Protection |
| :--- | :--- | :--- |
| **File Extension** | `.pdf` or `.docx` only | Blocks arbitrary file types and script execution |
| **MIME Type** | `application/pdf` or `application/vnd.openxmlformats-officedocument...` | Validates standard content type headers |
| **Magic Bytes** | PDF: `0x25 0x50 0x44 0x46` (`%PDF-`)<br>DOCX: `0x50 0x4B 0x03 0x04` (`PK\x03\x04`) | Prevents renamed executables, trojans, or spoofed images |
| **File Size Limit** | 5 MB (`RESUME_MAX_FILE_SIZE=5242880`) | Prevents DoS and memory exhaustion |
| **Safe Storage Filename** | `resume_${studentId}_${Date.now()}_${cryptoHex}.${ext}` | Prevents directory traversal and path manipulation |
| **Ownership Isolation** | Stream download requires `resume.studentId.equals(req.student._id)` | Strictly blocks cross-student resume viewing (HTTP 403 `FORBIDDEN_RESUME_ACCESS`) |

---

## 5. Text Extraction & Resume Intelligence

- **PDF Extraction**: Uses `pdf-parse` (supporting dual class/functional interface) for fast, deterministic text extraction.
- **DOCX Extraction**: Uses `mammoth` to extract clean raw text from Word XML structures.
- **Section Parsing**:
  - **Skills**: Matched against a comprehensive technical skill dictionary (covering Languages, Web, Backend, Databases, Cloud/DevOps, AI/ML, and Testing) using boundary-aware regex.
  - **Education**: Detects degrees (`B.Tech`, `MCA`, `BCA`, `B.E`, `M.Sc`, `Bachelor`, `Master`), institutions, and CGPA/GPA notations.
  - **Experience**: Highlights internship and software developer roles.
  - **Projects**: Extracts project descriptions and repository references.
  - **Certifications**: Extracts industry and cloud credentials (e.g. AWS Certified, Coursera, NPTEL).
  - **Keywords**: Analyzes top domain frequencies after stop-word elimination.
- **Scanned Document Resilience**: Scanned image-based PDFs without selectable text are assigned status `PARSED_EMPTY` with clear user guidance rather than throwing exceptions.
- **Corruption Resilience**: Malformed files are contained safely with status `FAILED` and recorded in `extractionError`.

---

## 6. Student Review & Skill Confirmation Workflow

1. **Extraction Does Not Prematurely Alter Profile**: Extracted skills remain pending review in the `Resume` document. The student's actual profile (`Student.skills`) is NOT modified until explicit confirmation.
2. **Interactive UI Review (`ResumeIntelligence.jsx`)**:
   - Students see all extracted skills as interactive toggle pills.
   - Students can check, uncheck, or add missing skills.
   - Clicking **"Confirm & Save Skills"** invokes `POST /student/resume/confirm-skills`.
3. **Safe Profile Merge**:
   - Newly confirmed skills merge with existing manual profile skills without overwriting or deleting unmentioned manual skills.
   - `Resume.confirmedSkills` and `Resume.confirmedAt` are persisted for auditing.
4. **Instant Recommendation Engine Reflection**:
   - The rule-based and ML recommendation engines immediately utilize confirmed skills in opportunity scoring and match reasons.

---

## 7. Backend-Enforced 30-Day Cooldown

1. **Authoritative Timestamp**: Cooldown checks `activeResume.uploadedAt` against authoritative server clock:
   $$\text{nextEligibleTime} = \text{lastUploadedAt} + (30 \times 24 \times 60 \times 60 \times 1000)\text{ ms}$$
2. **Rejection with Detail**: Attempting replacement within 30 days returns HTTP 403 `COOLDOWN_ACTIVE` with `daysRemaining`, `hoursRemaining`, and exact `nextEligibleDate`.
3. **Clock Immutability**:
   - Failed upload attempts do not reset or advance the clock.
   - Confirming or editing skills does not reset the clock.
   - Calling retry-parse on the existing GridFS binary does not reset the clock.
4. **Concurrency Protection**: In-memory student-level locks prevent race conditions during upload processing.
5. **Administrative Override**:
   - Gated via `requireAdmin` middleware.
   - Normal student attempts to supply `adminOverride=true` are strictly rejected with HTTP 403.
   - Authorized admins can bypass cooldown via `POST /student/resume/admin/override-cooldown` with mandatory audit reasons.

---

## 8. API Reference

### 1. `POST /student/resume/upload`
- **Auth**: `Bearer <Firebase Token>` (Student)
- **Body**: `multipart/form-data` with `resume` file field.
- **Success (201)**:
```json
{
  "message": "Resume uploaded and analyzed successfully.",
  "resume": {
    "id": "6ad0f33...",
    "filename": "Alex_Resume.pdf",
    "size": 98520,
    "mimeType": "application/pdf",
    "uploadedAt": "2026-10-15T15:37:20.566Z",
    "extractionStatus": "SUCCESS"
  },
  "extractedData": {
    "skills": ["React", "Node.js", "Python", "MongoDB", "Docker", "AWS"],
    "education": ["B.Tech Computer Science, Anna University, CGPA 8.8"],
    "experience": ["Software Engineer Intern at TechCorp"],
    "projects": ["Developed EduConnect Opportunity Platform"],
    "certifications": ["AWS Certified Cloud Practitioner"]
  },
  "cooldown": {
    "inCooldown": true,
    "daysRemaining": 30,
    "nextEligibleDate": "2026-11-14T15:37:20.566Z"
  }
}
```
- **Error (403)**:
```json
{
  "message": "Resume replacement is restricted to once every 30 days...",
  "code": "COOLDOWN_ACTIVE",
  "daysRemaining": 29,
  "nextEligibleDate": "2026-11-14T15:37:20.566Z"
}
```

### 2. `GET /student/resume`
- **Auth**: `Bearer <Firebase Token>` (Student)
- **Returns**: Current active resume metadata, parsed intelligence, confirmed skills, and cooldown status.

### 3. `GET /student/resume/download` (or `GET /student/resume/download/:resumeId`)
- **Auth**: `Bearer <Firebase Token>` (Student / Admin)
- **Security**: Verifies ownership. Returns HTTP 403 if requested by another student.
- **Response**: Binary stream with `Content-Type` and `Content-Disposition`.

### 4. `POST /student/resume/confirm-skills`
- **Auth**: `Bearer <Firebase Token>` (Student)
- **Body**: `{ "confirmedSkills": ["React", "Node.js", "Python"] }`
- **Response**: Merges confirmed skills into `Student.skills` and updates `Resume.confirmedSkills`.

### 5. `POST /student/resume/retry-parse`
- **Auth**: `Bearer <Firebase Token>` (Student)
- **Action**: Re-reads binary from GridFS and re-runs extraction without altering cooldown.

### 6. `POST /student/resume/admin/override-cooldown`
- **Auth**: Admin only (`requireAdmin`)
- **Body**: `{ "studentId": "...", "reason": "Authorized exception" }`

---

## 9. Automated Verification Suite: 100% Pass Rate

Run the Batch 6 test suite via:
```bash
npm run test:b6
```

### Test Results Summary:
- **Test Suite 1 (Document Validation)**: Rejected `.txt`, spoofed `.pdf` (missing magic bytes), spoofed `.docx` (missing magic bytes), oversized files (> 5MB); validated authentic PDF and DOCX.
- **Test Suite 2 (Text & Intelligence Extraction)**: Verified deterministic extraction of technical skills (`React`, `Node.js`, `Python`, `MongoDB`, `Docker`, `AWS`), Education, Experience, Projects; verified `PARSED_EMPTY` detection.
- **Test Suite 3 (Auth & Security Gates)**: Verified strict 401 for unauthenticated requests and 400 for empty uploads.
- **Test Suite 4 (GridFS Streaming Upload)**: Confirmed chunks in `resumes.chunks` and metadata in `resumes.files`; verified Student.skills remained unchanged prior to confirmation.
- **Test Suite 5 (GridFS Download & Isolation)**: Verified owner download stream and strict 403 blocking cross-student downloads.
- **Test Suite 6 (30-Day Cooldown)**: Verified HTTP 403 `COOLDOWN_ACTIVE` on immediate replacement attempts; confirmed clock immutability; rejected student adminOverride attempts.
- **Test Suite 7 (Skill Confirmation & Recommender Engine)**: Verified confirmation updates `Student.skills`, preserves pre-existing manual skills, and boosts recommendation scores.
- **Test Suite 8 (Retry-Parse)**: Verified re-parsing from GridFS without re-upload or resetting cooldown.
- **Test Suite 9 (30-Day Window Expiration & GridFS Cleanup)**: Verified successful replacement after 30 days and automatic deletion of the previous GridFS file.
- **Test Suite 10 (Admin Override)**: Verified administrator cooldown reset with audit logging.
