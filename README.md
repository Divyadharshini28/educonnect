# EduConnect - Unified Student Opportunity Platform

> **Review 1 Deliverable**: Student Opportunity Discovery and Recommendation Module

EduConnect is a centralized student opportunity platform covering **scholarships, internships, hackathons, and certifications**. The platform uses a **Hybrid Recommender System** combining **Hard Eligibility Rule Gates** (Department, Year, CGPA cutoff) with a **Content-Based Vector Space Machine Learning Model (TF-IDF and Cosine Similarity)**.

---

## Architecture and Core Modules

- **Tech Stack**: MERN (MongoDB, Express.js, React.js, Node.js) + Firebase Authentication.
- **Visual Design**: Professional Blue and White palette (`#1E40AF`, `#2563EB`, `#F8FAFC`, `#FFFFFF`, `#0F172A`). Zero emojis, clean institutional typography, and SVG iconography.
- **Authentication**: Strict login and student registration flow capturing academic credentials (Department, Year, CGPA, Technical Skills, and Areas of Interest).
- **Hybrid Recommender Engine**:
  - **Deterministic Rule Gate**: Enforces branch compliance, minimum study year, and cutoff CGPA. Ineligible opportunities are marked and penalized.
  - **Content-Based ML Vector Space Model**: Computes TF-IDF term weights and evaluates vector cosine similarity between student profiles and opportunity requirements.
  - **Explainability**: Outputs specific audit reasons and top TF-IDF matching tokens (e.g., `react`, `mongodb`).
- **Opportunity Catalog**: Filterable by category (Scholarships, Internships, Hackathons, Certifications), academic department, and search query.
- **Application Lifecycle Tracking**: Complete internal workflow (`Submitted`, `Under Review`, `Accepted`, `Rejected`) with direct links to external official portals.

---

## Directory Structure

```
educonnect/
├── client/                     # React.js Frontend (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/         # Navbar, OpportunityCard, ApplyModal, AuthModal
│   │   ├── context/            # AuthContext (Firebase + JWT Session)
│   │   ├── pages/              # Landing, Recommendations, Opportunities, Applications, Profile
│   │   ├── api.js              # Axios API client with Bearer token interceptor
│   │   └── firebase.js         # Firebase Client SDK configuration
│   └── package.json
│
├── server/                     # Express.js REST API Backend
│   ├── src/
│   │   ├── config/             # MongoDB connection and Firebase Admin setup
│   │   ├── controllers/        # Auth, Student, Opportunity, Application controllers
│   │   ├── middleware/         # Token verification middleware
│   │   ├── models/             # Student, Opportunity, Application, Recommendation schemas
│   │   ├── routes/             # REST API routes
│   │   ├── seed/               # Curated opportunity dataset
│   │   ├── services/           # Rule engine and ML Vector Space services
│   │   └── tests/              # Automated verification test suite
│   └── package.json
│
└── package.json                # Root workspace configuration
```

---

---

## Quick Start Guide for Teammates / Developers

### 1. Clone the Repository & Install Dependencies
```bash
git clone <YOUR_GIT_REPOSITORY_URL>
cd educonnect
npm run setup
```
*(This automatically installs dependencies for root, backend server, and frontend client in one go).*

### 2. Configure Environment Files
- Copy `server/.env.example` to `server/.env`
- Copy `client/.env.example` to `client/.env`
*(If using Firebase Auth, fill in your Firebase configuration keys).*

### 3. Start Both Backend and Frontend (Single Command)
```bash
npm run dev
```
- **Backend API**: Runs on `http://localhost:5000`
- **Frontend UI**: Runs on `http://localhost:5173`

*(Alternatively, you can run `npm start` for standard mode).*

---

## Individual Service Commands

- **Run Automated Tests**: `npm test`
- **Run Phase 8 Verification Tests**: `npm --prefix server run test:p8` or `node server/src/tests/testPhase8.js`
- **Start Backend only**: `npm run server` (or `npm run server:dev` for live reload)
- **Start Frontend only**: `npm run client`
- **Seed Opportunities Data**: `npm run seed`

---

## Phase 8: Student Interaction Tracking & Behavioral Analytics

Phase 8 introduces genuine behavioral interaction logging across student sessions to prepare high-quality training and evaluation datasets for the upcoming **Phase 9 Random Forest Recommendation Model**.

### 1. Canonical Interaction Types
All interaction events are recorded using standardized uppercase canonical types:
- `VIEW`: Recorded when an authenticated student genuinely opens an opportunity detail view/modal (distinct from merely rendering a card in a list).
- `CLICK`: Recorded when a student clicks an external action or official application link (`targetUrl`).
- `BOOKMARK`: State transition event recorded when a student saves an opportunity to their profile bookmarks.
- `UNBOOKMARK`: State transition event recorded when a student removes an opportunity from their bookmarks.
- `APPLY`: Recorded when an application is submitted through EduConnect's verified application pipeline.
- `DISMISS`: Explicit dismissal indicator (if student explicitly marks an opportunity as not interested).

### 2. Interaction REST APIs
All interaction endpoints require verified Firebase Bearer token authentication (`requireAuth`):
- `POST /api/interactions`: Record a new student interaction event.
  - Body: `{ opportunityId: "...", interactionType: "VIEW", metadata: { source: "opportunity-detail" } }`
  - Student identity is derived authoritatively from the verified Firebase token (`req.student`), preventing student ID spoofing.
  - Server generates authoritative timestamp (`Date.now()`).
  - Opportunity existence is strictly validated (HTTP 404 if not found).
- `GET /api/interactions`: Query authenticated student's interaction history.
  - Supports pagination (`page=1&limit=20`) and filtering (`interactionType`, `opportunityId`, `startDate`, `endDate`).
  - Returns: `{ data: [...], page: 1, limit: 20, total: N, totalPages: M }`.
  - Student-scoped: students cannot view other students' interaction data.
- `GET /api/interactions/summary`: Retrieve aggregate behavioral metrics for the authenticated student.
  - Returns: `{ studentId, totalInteractions, summary: { totalViews, totalClicks, totalBookmarks, totalUnbookmarks, totalApplications } }`.

### 3. Data Integrity & Privacy
- **Authoritative Server Identity**: Student ID in request bodies is never trusted; identity is resolved from Firebase UID to the MongoDB Student record.
- **Metadata Sanitization**: Only analytical context fields (`source`, `page`, `position`, `targetUrl`, `applicationId`, `action`) are retained. Sensitive keys (`password`, `token`, `secret`, `key`, `auth`, `cookie`) and arbitrary payload bloat are stripped automatically.
- **Non-Blocking Architecture**: Analytics tracking failures never disrupt primary user actions (browsing, applying, bookmarking).
- **Database Persistence**: Interactions are persisted to the local disk store (`data/db_store.json`) and restored cleanly on startup.

### 4. Machine Learning Preparation (Phase 9 Readiness)
Phase 8 records raw behavioral evidence without artificially hardcoding machine learning labels (`INTERESTED=1`/`NOT_INTERESTED=0`). This enables Phase 9 to derive diverse feature vectors (`departmentMatch`, `yearEligible`, `cgpaEligible`, `skillMatchRatio`, `deadlineDays`, `hasPriorInteraction`) and train the Random Forest recommender model on genuine student behavior.
*(Note: Phase 9 ML recommendations are not yet implemented in Phase 8).*

---

## Batch 5: Opportunity API Expansion & Data Collection Reliability

Batch 5 expands opportunity ingestion, audits and repairs existing sources, and provides reliable data collection:

### 1. Supported Providers
- **Devpost** (`https://devpost.com/api/hackathons`): Global hackathons, coding contests, prizes, and real attendee counts. Public, no key needed.
- **Remotive** (`https://remotive.com/api/remote-jobs`): Remote software engineering internships and tech roles. Public, no key needed.
- **Arbeitnow** (`https://www.arbeitnow.com/api/job-board-api`): Apprenticeships and developer positions. Public, no key needed.
- **Hopin** (`https://api.hopinjobs.com`): Repaired to extract live `current_attendees` and apply bounded retries.
- **Brabble.ai** (`https://brabble.ai`): Audited; requires `BRABBLE_API_KEY`. Gracefully reports `CONFIG_REQUIRED` if unconfigured.
- **BodhDisha** (`https://bodhdisha.com/api/v1`): Audited; requires `BODHDISHA_API_KEY`. Gracefully reports `CONFIG_REQUIRED` if unconfigured.

### 2. Multi-Source Orchestration & Reliability
- **Fault Isolation**: Healthy providers synchronize regardless of other providers' failures or configuration requirements.
- **Idempotent Upsert & Deduplication**: Stable provider identifiers with deterministic hash fallbacks; MongoDB document `_id` is strictly preserved, protecting student applications and bookmarks.
- **Admin Governance**: Synchronization status (`GET /api/sync/status`) and triggers (`POST /api/sync/trigger`) are protected with `requireAuth` and `requireAdmin`.

### 3. Verification Commands
- `npm run test:b5`: Complete Batch 5 verification test suite.
- `npm run test:b4`: Batch 4 test suite.
- `npm run test:analytics`: Student Analytics & Insights test suite.
- `npm test`: Baseline unit and ML recommender tests.
- `npm --prefix client run build`: Client production build.

---

## Batch 6: Resume Intelligence, MongoDB GridFS Storage & 30-Day Cooldown

Batch 6 introduces secure resume upload, MongoDB GridFS binary chunking, text extraction intelligence, student-confirmed skill mapping, and a strict backend-enforced 30-day replacement restriction:

### 1. Architectural Highlights
- **MongoDB GridFS Storage**: Original PDF and DOCX files reside in the dedicated `resumes` bucket (`resumes.files` and `resumes.chunks`). No third-party cloud storage (AWS S3, Firebase Storage) and zero Base64 in documents.
- **Strict File Security**: Allowed formats are `.pdf` and `.docx` only, verified by magic bytes signatures (`%PDF-`, `PK\x03\x04`), 5 MB maximum file size limit, and randomized safe storage filenames.
- **Ownership Isolation**: Resume downloads require verified student ownership matching the Firebase token (`403 Forbidden` on unauthorized cross-student access).
- **Text Extraction Intelligence**: Deterministic extraction for PDF (`pdf-parse`) and DOCX (`mammoth`). Identifies skills, education, experience, projects, certifications, and keywords. Scanned documents are safely assigned `PARSED_EMPTY` status with user guidance.
- **Student-Confirmed Skills Only**: Extracted skills remain pending until the student reviews and confirms them in the UI. Confirmed skills merge with existing manual profile skills and immediately boost recommendation scores.
- **Backend-Enforced 30-Day Cooldown**: Restricted to 1 replacement every 30 days based on authoritative server timestamps. Failed uploads and skill edits do not advance or reset cooldown. Replaced files have their old GridFS binaries cleaned up automatically.
- **Admin Override**: Authorized administrators can override cooldowns with mandatory audit reasons.

### 2. Verification Commands
- `npm run test:b6`: Complete Batch 6 verification test suite (10 test suites, 100% pass rate).
- Full documentation available at `docs/BATCH6_RESUME_INTELLIGENCE.md`.



