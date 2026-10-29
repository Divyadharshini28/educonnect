# EduConnect — Batch 5 Implementation Report: Opportunity API Expansion & Data Collection Reliability

## 1. Executive Summary

Batch 5 expands EduConnect's external opportunity aggregation capabilities, audits and repairs existing integrations (Hopin, Brabble, BodhDisha), introduces three verified, legitimate external data providers (**Devpost**, **Remotive**, and **Arbeitnow**), enforces strict administrator authorization on all synchronization controls, and implements robust fault-isolated, idempotent synchronization.

---

## 2. Initial Audit Findings

| Provider | Endpoint Inspected | Auth Required | Status Found | Audit Observations & Root Causes |
|---|---|---|---|---|
| **Hopin** | `https://api.hopinjobs.com` | No (Public) | Partial (`success=true`) | • `/api/internships`: Returns `{ internships: [] }` (currently 0 items).<br>• `/api/jobs`: Returns `{ jobs: [] }` (currently 0 items).<br>• `/api/events`: Returns live array of 24 events.<br>• **Bug**: `extractExternalApplicantStats` did not check `current_attendees`, causing live attendee counts (e.g. 1034) to be lost/set to `null`.<br>• Missing bounded retry logic on transient network errors. |
| **Brabble** | `https://brabble.ai/api/listings` | Yes (`Bearer <token>` / `x-api-key`) | Failed (`success=false`) | • Returns HTTP 401 Unauthorized (`Missing API key...`).<br>• Root Cause: Unauthenticated requests were dispatched over the wire when `BRABBLE_API_KEY` was missing from `.env`, throwing uncaught 401 errors instead of reporting configuration requirements cleanly.<br>• Missing bounded exponential backoff on 429/5xx. |
| **BodhDisha** | `https://bodhdisha.com/api/v1` | Yes (`Authorization` / `X-API-Key`) | Failed (`success=false`) | • Returns HTTP 401 Unauthorized (`A valid API key is required`).<br>• Root Cause: Same as Brabble — missing API key caused failed HTTP requests without clear administrator configuration guidance.<br>• Missing retry helper. |
| **Sync Routes** | `GET /api/sync/status`<br>`POST /api/sync/trigger` | None (Unprotected) | Security Vulnerability | • Endpoints had zero authentication middleware, allowing unauthenticated public callers to view scheduler logs and trigger ingestion cycles.<br>• Server only mounted `/api/sync` while client called `/sync/status`, causing 404 in frontend. |

---

## 3. Issues Fixed and Root Causes

1. **Missing External Applicant Count in Hopin Normalization**:
   - **Root Cause**: In `server/src/utils/normalizeOpportunity.js`, `extractExternalApplicantStats` checked `applicant_count`, `applicants_count`, `attendees_count`, and `registrations_count`, but the live Hopin API returns `current_attendees: 1034`.
   - **Fix**: Added `raw.current_attendees` into `extractExternalApplicantStats`, preserving genuine external applicant numbers while strictly avoiding synthetic zeros.

2. **Unconfigured Provider Error Handling**:
   - **Root Cause**: `brabbleService.js` and `bodhdishaService.js` attempted network HTTP calls even when API keys were empty, resulting in HTTP 401 crashes and ambiguous failure logs.
   - **Fix**: Added proactive configuration inspection. If `!apiKey && !options.customData`, both services return `isConfigRequired: true` with status `CONFIG_REQUIRED` and direct URLs to the developer portals (`https://brabble.ai/dashboard` and `https://bodhdisha.com/api/register`).

3. **Resilience & Bounded Retries**:
   - **Root Cause**: Services did not implement retry mechanisms for transient network hiccups or HTTP 429/5xx codes.
   - **Fix**: Created `server/src/utils/fetchWithRetry.js` providing bounded retries (default 2), configurable timeouts, and exponential backoff.

4. **Security & Route Mounting**:
   - **Root Cause**: `syncRoutes.js` lacked authentication middleware; `server.js` only mounted `/api/sync`, but frontend called `/sync/status`.
   - **Fix**: Mounted both `/api/sync` and `/sync` in `server.js`. Protected all sync routes with `requireAuth` and `requireAdmin` middleware.

5. **Python Stdin Socket Error in Development**:
   - **Root Cause**: In `rfRecommenderService.js`, writing to `child.stdin` without an `error` listener caused an unhandled `write EOF` exception if Python exited early due to missing `joblib`.
   - **Fix**: Added an error handler on `child.stdin` and safely wrapped writes in try/catch to maintain fallback stability.

---

## 4. Additional Opportunity Sources Integrated

Three legitimate, live, documented data sources were verified and integrated:

### 1. Devpost (`devpostService.js`)
- **Purpose**: Global student hackathons, coding challenges, machine learning sprints, and competitive programming events.
- **Endpoint**: `https://devpost.com/api/hackathons`
- **Authentication**: Public, no API key required.
- **Attributes Mapped**:
  - `id` -> `externalId`
  - `title` -> `title`
  - `organization_name` -> `organization`
  - `displayed_location` -> `location`, `mode` (`ONLINE` / `OFFLINE`)
  - `submission_period_dates` -> parsed `deadline`
  - `themes` -> mapped to technical `skills` and `department`
  - `prize_amount` -> parsed clean monetary reward (`stipendOrReward`)
  - `registrations_count` -> real external applicant count (`externalApplicantCount`)
  - `open_state` -> active/expired status computation

### 2. Remotive (`remotiveService.js`)
- **Purpose**: Remote student internships, junior engineering placements, software development positions.
- **Endpoint**: `https://remotive.com/api/remote-jobs`
- **Authentication**: Public, no API key required.
- **Attributes Mapped**:
  - `id` -> `externalId`
  - `title` -> `title`
  - `company_name` -> `organization`
  - `job_type` / `title` -> canonical type (`INTERNSHIP` vs `PLACEMENT`)
  - `tags` -> normalized technology `skills` (React, Node.js, Python, AWS, Docker, etc.)
  - `salary` -> `stipendOrReward`
  - `candidate_required_location` -> `location` (`Remote (Worldwide)`)
  - `url` -> `applicationUrl`, `officialUrl`

### 3. Arbeitnow (`arbeitnowService.js`)
- **Purpose**: Apprenticeships, technical internships, and entry-level developer positions.
- **Endpoint**: `https://www.arbeitnow.com/api/job-board-api`
- **Authentication**: Public, no API key required.
- **Attributes Mapped**:
  - `slug` -> `externalId`
  - `title` -> `title`
  - `company_name` -> `organization`
  - `job_types` -> canonical type (`INTERNSHIP` vs `PLACEMENT`)
  - `tags` -> normalized `skills`
  - `remote` -> `mode` (`ONLINE` if true, `OFFLINE` if false)
  - `created_at` -> `postedDate`
  - `url` -> `applicationUrl`

---

## 5. Files Created or Modified

### Created Files
- `server/src/utils/fetchWithRetry.js`: Shared HTTP request utility with timeout, exponential backoff, and bounded retries.
- `server/src/services/devpostService.js`: Dedicated Devpost Hackathons API adapter.
- `server/src/services/remotiveService.js`: Dedicated Remotive Remote Tech API adapter.
- `server/src/services/arbeitnowService.js`: Dedicated Arbeitnow Job Board API adapter.
- `server/src/tests/testBatch5SyncReliability.js`: Comprehensive 5-part verification test suite.
- `docs/BATCH5_OPPORTUNITY_API_EXPANSION_RELIABILITY.md`: This comprehensive implementation report.

### Modified Files
- `server/src/utils/normalizeOpportunity.js`:
  - Added `stripHtmlTags` utility.
  - Added `generateDeterministicExternalId` fallback for unkeyed listings.
  - Added `normalizeDevpostHackathon`, `normalizeRemotiveJob`, `normalizeArbeitnowJob`.
  - Updated `extractExternalApplicantStats` to support `current_attendees`.
- `server/src/services/hopinService.js`: Integrated `fetchWithRetry` and bounded timeouts.
- `server/src/services/brabbleService.js`: Proactive API key verification, `CONFIG_REQUIRED` status, and `fetchWithRetry`.
- `server/src/services/bodhdishaService.js`: Proactive API key verification, `CONFIG_REQUIRED` status, and `fetchWithRetry`.
- `server/src/services/syncService.js`: Complete multi-source orchestration for 6 providers, fault isolation, and unified `executeGenericSync`.
- `server/src/models/SyncLog.js`: Added support for new provider sources, `CONFIG_REQUIRED` status, and `recordsSkipped`.
- `server/src/routes/syncRoutes.js`: Enforced `requireAuth` and `requireAdmin`, added provider health cards aggregation, and selective provider triggering.
- `server/src/server.js`: Mounted both `/api/sync` and `/sync`.
- `server/src/services/rfRecommenderService.js`: Added error listener on child stdin to prevent unhandled socket errors.
- `server/src/tests/testBatch2Dashboard.js`: Updated strict assertion to allow catalog growth (>= 16).
- `client/src/pages/AdminDashboardPage.jsx`: Added provider health status cards with status badges, record metrics, last success timestamps, and per-provider manual sync buttons.
- `server/.env.example`: Documented new environment variable placeholders (`DEVPOST_*`, `REMOTIVE_*`, `ARBEITNOW_*`).
- `package.json` & `server/package.json`: Added `test:b5` script.

---

## 6. Environment Variables

All environment variables use safe default values and fallbacks. No private keys or real tokens are committed:

```env
# Existing
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/educonnect
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# Hopin Jobs & Events (Public API)
HOPIN_API_BASE_URL=https://api.hopinjobs.com
HOPIN_API_TIMEOUT_MS=10000

# Brabble Hackathons (Requires API Key)
BRABBLE_API_KEY=
BRABBLE_API_BASE_URL=https://brabble.ai
BRABBLE_API_TIMEOUT_MS=10000

# BodhDisha Scholarships & Courses (Requires API Key)
BODHDISHA_API_KEY=
BODHDISHA_API_BASE_URL=https://bodhdisha.com/api/v1
BODHDISHA_API_TIMEOUT_MS=10000

# Devpost Hackathons & Challenges (Public API)
DEVPOST_API_BASE_URL=https://devpost.com
DEVPOST_API_TIMEOUT_MS=10000

# Remotive Remote Tech Opportunities (Public API)
REMOTIVE_API_BASE_URL=https://remotive.com
REMOTIVE_API_TIMEOUT_MS=10000

# Arbeitnow Tech Jobs & Apprenticeships (Public API)
ARBEITNOW_API_BASE_URL=https://www.arbeitnow.com
ARBEITNOW_API_TIMEOUT_MS=10000

# Synchronization Scheduler
SYNC_SCHEDULER_ENABLED=true
SYNC_SCHEDULE=0 */6 * * *
```

---

## 7. Data Normalization and Deduplication Behavior

- **Canonical Mapping**: All incoming listings are normalized into EduConnect's standard `Opportunity` schema (`title`, `type`, `description`, `organization`, `location`, `mode`, `eligibility`, `deadline`, `stipendOrReward`, `applicationUrl`, `source`, `externalId`, `externalApplicantCount`).
- **Natural Composite Key**: Deduplication relies on `{ source, externalId }` with a unique index.
- **Deterministic Fallback**: If a source lacks a native ID, a deterministic SHA-256 hash is generated from `source + (url || title + ":" + organization)`, guaranteeing stable idempotent matching.
- **Preservation of Document Identity**: When an existing opportunity is updated, MongoDB's `_id` is strictly preserved (`$set: normalizedFields`). Student applications (`Application` model) and student bookmarks (`Student.bookmarks`) referencing `opportunityId` remain 100% intact.
- **External Statistics Isolation**: External applicant/attendee counts (e.g. Hopin `current_attendees`, Devpost `registrations_count`) are saved in `externalApplicantCount` and `externalStats` and never merged into internal EduConnect student application submissions.

---

## 8. Multi-Source Synchronization & Failure Handling

- **Fault Isolation**: Every provider is wrapped in an independent `try/catch` block within `syncAllSources`. If Brabble or BodhDisha requires configuration or Devpost encounters a network error, healthy sources (Hopin, Remotive, Arbeitnow) continue running.
- **Granular Status Tracking**:
  - `SUCCESS`: Ingestion completed with 0 validation errors (including healthy empty responses).
  - `PARTIAL_SUCCESS`: Some records inserted/updated, with row-level validation warnings.
  - `CONFIG_REQUIRED`: Provider requires an API key in `.env`; request gracefully stopped.
  - `FAILED`: Network timeout or unexpected server error.
- **Accurate Metric Accounting**: Tracks `recordsFetched`, `recordsInserted`, `recordsUpdated`, `recordsSkipped`, and `recordsFailed`.

---

## 9. API Endpoints Summary

| Endpoint | Method | Authorization | Description |
|---|---|---|---|
| `/api/sync/status` | GET | Admin (`requireAuth`, `requireAdmin`) | Operational status of the cron scheduler, detailed health cards for all 6 providers, and recent SyncLogs. |
| `/sync/status` | GET | Admin (`requireAuth`, `requireAdmin`) | Mounted alias for client compatibility. |
| `/api/sync/trigger` | POST | Admin (`requireAuth`, `requireAdmin`) | Trigger synchronization. Supports `{ provider: "all" }` or targeted `{ provider: "devpost" }`. |
| `/sync/trigger` | POST | Admin (`requireAuth`, `requireAdmin`) | Mounted alias for client compatibility. |
| `/opportunities` | GET | Public | Returns active catalog with support for search, filtering, and server pagination. |
| `/opportunities/:id` | GET | Public | Single opportunity detail embedding both external statistics and internal application counts. |

---

## 10. Verification & Test Execution Results

All automated test suites were executed on Node.js v24 on Windows:

| Test Command | Test Focus | Status | Details |
|---|---|---|---|
| `npm run test:b5` | Batch 5 Verification Suite | **PASS** (100%) | 17 assertions across provider normalization, deduplication, fault isolation, admin gates, and student catalog discovery. |
| `npm test` | Core Unit & Protected Routes | **PASS** (100%) | Rule engine, TF-IDF cosine similarity, token security, and public catalog routes. |
| `npm run test:b4` | Batch 4 Verification Suite | **PASS** (100%) | CSV parsing, admin authorization, opportunity CRUD, soft deletion, engagement analytics. |
| `npm run test:analytics` | Student Analytics & Insights | **PASS** (100%) | Student application stats, category breakdown, external vs EduConnect applicant count isolation. |
| `npm run test:p8` | Phase 8 Interaction Tracking | **PASS** (16/16) | VIEW/CLICK/BOOKMARK/APPLY interactions, pagination, anti-spoofing, disk restore. |
| `npm run test:p10` | Phase 10 End-to-End Smoke Test | **PASS** (13/13) | Complete student journey: registration, browsing, interactions, bookmarks, applications, recommendations. |
| `node server/src/tests/testBatch2Dashboard.js` | Batch 2 Dashboard & Applications | **PASS** (8/8) | New user initialization, stage tracking (1 to 5), 7-day closing window filter. |
| `node server/src/tests/testBatch3Features.js` | Batch 3 Features & Eligibility | **PASS** (3/3) | Branch/Year/CGPA gates, deadline notification deduplication, unapplied recommendation prioritization. |
| `npm --prefix client run build` | Frontend Production Build | **PASS** (Vite) | Client compiled in 3.69s with zero errors (`dist/assets/index-BzXpOVFr.js`). |

---

## 11. Known Limitations & Providers Requiring Setup

1. **Brabble (`brabble.ai`)**:
   - Status: Valid endpoint, but requires an API key.
   - Setup: Register at `https://brabble.ai/dashboard`, obtain an API key, and set `BRABBLE_API_KEY=your_key` in `server/.env`.
   - Behavior when unset: Proactively marked `CONFIG_REQUIRED` without crashing other sources.

2. **BodhDisha (`bodhdisha.com`)**:
   - Status: Valid endpoint, but requires an API key.
   - Setup: Register at `https://bodhdisha.com/api/register`, obtain an API key, and set `BODHDISHA_API_KEY=your_key` in `server/.env`.
   - Behavior when unset: Proactively marked `CONFIG_REQUIRED` without crashing other sources.

3. **Active Live Providers (Zero API Key Required)**:
   - **Devpost**: Fully operational, public.
   - **Remotive**: Fully operational, public.
   - **Arbeitnow**: Fully operational, public.
   - **Hopin Events**: Fully operational, public.
