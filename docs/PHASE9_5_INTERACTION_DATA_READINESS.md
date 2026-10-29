# Phase 9.5: Real Interaction Data Collection Pipeline & Readiness

## 1. Objective

The objective of **Phase 9.5** is to improve, harden, and verify the **real student interaction-data collection pipeline** in EduConnect. This ensures that the platform naturally and reliably accumulates trustworthy, authentic behavioral data over time for future Machine Learning (ML) retraining cycles.

### Explicit Scope Boundaries
- **No Model Retraining**: Random Forest was intentionally **NOT** retrained during Phase 9.5.
- **No Synthetic Interaction Generation**: No fake user interactions or synthetic actions were generated or added to production.
- **No Benchmark Inflation**: Benchmark seed datasets remain distinct from production databases and were not artificially enlarged.
- **No Label Semantic Tampering**: `VIEW` and `CLICK` interactions are preserved as behavioral/context features and never treated as negative labels.

---

## 2. Existing Interaction Architecture

Interaction tracking was architected in Phase 8 and feeds into Phase 9's ML dataset generator:

```
[Student in React UI]
   │
   ├─► Detail Page Open ──────────► trackView() ────────┐
   ├─► External Link Click ───────► trackClick() ───────┤
   ├─► Save / Unsave ─────────────► /student/bookmarks ─┼─► [POST /api/interactions]
   └─► Internal Application Submit ► /applications ──────┤          │
                                                        ▼          ▼
                                                  [MongoDB: Interaction Collection]
                                                  [Disk Store: db_store.json]
                                                        │
                                                        ▼
                                          [mlDatasetGenerator.js]
                                                        │
                                                        ▼
                                        [ml/data/training_data.json]
```

### Components
1. **Frontend Service (`client/src/services/interactionTracker.js`)**:
   - Provides non-blocking tracking helpers: `trackView`, `trackClick`, `trackBookmark`, `trackUnbookmark`, `trackApply`.
   - Never blocks UI rendering or user navigation if telemetry requests fail.
2. **Backend Controller (`server/src/controllers/interactionController.js`)**:
   - Handles `POST /api/interactions`, `GET /api/interactions`, and `GET /api/interactions/summary`.
   - Validates existence of opportunities and enforces canonical uppercase interaction types.
   - Attaches authoritative server timestamps (`new Date()`).
   - Sanitizes client metadata to prevent payload bloat and credential exposure.
3. **Application Controller (`server/src/controllers/applicationController.js`)**:
   - Manages internal opportunity applications (`POST /applications`).
   - Automatically records canonical `APPLY` interactions with link to created `Application` IDs.
   - Enforces unique application constraints (student + opportunity).
4. **Student Controller (`server/src/controllers/studentController.js`)**:
   - Manages student bookmarks (`POST /student/bookmarks/:opportunityId` and `DELETE /student/bookmarks/:opportunityId`).
   - Persists bookmark references in the `Student.bookmarks` array and records corresponding `BOOKMARK` / `UNBOOKMARK` interactions.
5. **ML Dataset Generator (`server/src/services/mlDatasetGenerator.js`)**:
   - Consumes historical interaction events to build structured JSON for model training.
   - Enforces timeline anti-leakage: only interactions occurring strictly prior to event timestamp $T$ are provided as historical context.

---

## 3. Interaction Semantics

EduConnect maintains 6 canonical uppercase interaction types defined in `Interaction.js`:

| Type | Nature | ML Role | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `VIEW` | Exploratory | Context Feature | Authenticated student opens an opportunity's detail page. |
| `CLICK` | Exploratory | Context Feature | Student clicks an external portal/application link or action button. |
| `BOOKMARK` | Positive Engagement | Label = 1 | Student saves an opportunity to bookmarks. |
| `UNBOOKMARK` | Bookmark Removal | State Management | Student removes a saved opportunity from bookmarks. |
| `APPLY` | Positive Engagement | Label = 1 | Student successfully submits an internal application through EduConnect. |
| `DISMISS` | Negative Feedback | Label = 0 | Student explicitly dismisses a recommendation card (when available). |

---

## 4. Changes Made in Phase 9.5

1. **Frontend External Click Telemetry Wiring**:
   - In `client/src/pages/OpportunityDetailPage.jsx`: Connected `trackClick` with action metadata (`source: 'opportunity-detail-official-link'`) to the "Visit official portal" link.
   - In `client/src/components/ApplyModal.jsx`: Connected `trackClick` to the post-submission external portal link (`source: 'apply-modal-external-link'`).
   - In `client/src/pages/ApplicationsPage.jsx`: Connected `trackClick` to the application detail modal's official portal link (`source: 'applications-page-official-link'`).
2. **Strict APPLY vs. CLICK Demarcation**:
   - Confirmed that clicking an external URL records `CLICK` only and never creates a false `Application` record or `APPLY` interaction.
   - Confirmed that internal submissions via `ApplyModal` / `POST /applications` create genuine `Application` records and record authoritative `APPLY` events.
3. **Verification Suite (`server/src/tests/testPhase9_5.js`)**:
   - Created a comprehensive test suite with 9 dedicated automated tests covering:
     - Authenticated `VIEW` recording and unauthenticated rejection.
     - `CLICK` recording without accidental `APPLY`.
     - `BOOKMARK` and `UNBOOKMARK` semantic distinction and idempotency.
     - `APPLY` creation on successful application and prevention on duplicate attempts.
     - Explicit `DISMISS` vs passive browsing immunity.
     - Firebase identity token derivation and anti-spoofing.
     - Input validation and rejection of malformed IDs/types.
     - ML label semantics and timeline anti-leakage verification.
4. **Package Script Integration**:
   - Added `test:p9_5` to root `package.json` and `server/package.json`.

---

## 5. Firebase Identity Handling

- **Token-Derived Identity**: The backend middleware (`server/src/middleware/authMiddleware.js`) verifies the incoming Firebase ID Token using `admin.auth().verifyIdToken(token)`.
- **Anti-Spoofing**: The authenticated student document is looked up in MongoDB via `firebaseUID` and attached to `req.student`. Even if a malicious client payload contains a foreign `studentId`, `interactionController.js` and `applicationController.js` exclusively assign `studentId: req.student._id`.
- **Zero Credential Exposure**: Passwords and Firebase tokens are never stored in MongoDB or disk stores.

---

## 6. MongoDB Persistence & Storage Architecture

- **Primary Active Store**: `mongodb://127.0.0.1:27017/educonnect`
- **Fallback / Disk Store**: `server/data/db_store.json`
- **Synchronization**: Every write in `recordInteraction`, `toggleBookmark`, and `submitApplication` triggers `syncToDisk()` to persist state to disk storage. Restoring with `restoreFromDisk()` recovers interaction documents with exact schemas and timestamps.

---

## 7. APPLY Semantics

- **Genuine Submission Requirement**: An `APPLY` interaction is recorded only after an `Application` document is saved in MongoDB.
- **Duplicate Prevention**: If a student attempts to apply for the same opportunity a second time, `POST /applications` returns `400 Bad Request` ("You have already submitted an application for this opportunity."), preventing duplicate applications and duplicate `APPLY` interactions.
- **External Distinction**: External opportunities directing users to official third-party portals record `CLICK` interactions with destination metadata. They never record `APPLY` unless submitted through EduConnect's workflow.

---

## 8. VIEW & CLICK Semantics

- **VIEW**:
  - Captured when a student accesses an opportunity's detail page (`/opportunity/:id`).
  - Does NOT trigger merely because an opportunity is listed on the Home page, Browse catalog, or Recommended feed.
- **CLICK**:
  - Captured when a user clicks external links (e.g., "Visit official portal" or "Open official application page").
  - Preserves user navigation in new tabs (`target="_blank"`) while non-blocking telemetry runs.
- **Exploratory Status**: Both `VIEW` and `CLICK` represent exploratory engagement. They are treated as historical behavioral features (`hasPriorInteraction`, `priorInteractionCount`) in feature engineering and are never classified as negative labels ($0$).

---

## 9. Bookmark Semantics

- **BOOKMARK**:
  - Triggered upon saving an opportunity.
  - Updates `Student.bookmarks` array and persists a `BOOKMARK` interaction document.
- **UNBOOKMARK**:
  - Triggered upon unsaving an opportunity.
  - Removes the ID from `Student.bookmarks` and persists an `UNBOOKMARK` interaction document.
- **Idempotency**: Repeated page renders or query calls to `GET /student/bookmarks` do not record interaction events.

---

## 10. DISMISS Semantics

- **Explicit Action Only**: A `DISMISS` event is only recorded if a student explicitly triggers a dismiss action.
- **No Passive Dismissal**: Scrolling past an opportunity, opening another opportunity, or browsing catalog lists is never converted into a `DISMISS`.
- **Label Strategy**: In ML training, `DISMISS` serves as the canonical negative label ($0$).

---

## 11. Duplicate-Event Prevention

- React rendering lifecycles, re-renders, and list queries do not trigger tracking calls.
- Detail page views are scoped to the route lifecycle (`useEffect([id])`).
- Bookmark toggles are triggered strictly on intentional button clicks.
- Applications enforce single-submission constraints on the backend.

---

## 12. Anti-Leakage Considerations

In `mlDatasetGenerator.js`, when extracting historical behavioral features for an event at timestamp $T$:
$$\text{pastInteractions} = \{ i \in \text{Interactions}_{\text{student}} \mid \text{timestamp}(i) < T \}$$
Interactions occurring at or after $T$ (including the target event itself) are strictly excluded from the prior interaction context, preventing data leakage.

---

## 13. Tests Performed

The following test suites were executed:
1. **Phase 8 Interaction Tests**: `npm run test:p8`
2. **Phase 9 Random Forest Regression Tests**: `npm run test:p9`
3. **Phase 9.5 Verification Tests**: `npm run test:p9_5`
4. **Pre-Phase 10 ML Data Audit Tests**: `npm run test:audit`
5. **Standalone ML Data Audit**: `npm run audit:ml-data`
6. **Backend Server Tests**: `npm test`
7. **Frontend Production Build**: `npm run client:build`

---

## 14. Test Results

```text
Phase 8 interaction tests: 16/16 PASS
Phase 9 regression tests: 16/16 PASS
Phase 9.5 tests: 9/9 PASS
ML data audit tests: 10/10 PASS
npm test: PASS
frontend build: PASS
```

---

## 15. Data-Audit Results

The read-only audit (`npm run audit:ml-data`) executed against the active database:

- **Active Persistence**: MongoDB Local Daemon (`127.0.0.1:27017`)
- **Students**: 3
- **Opportunities**: 12
- **Applications**: 9
- **Interactions**: 0 (Clean baseline before genuine production user traffic)
- **Recommendations**: 5
- **SyncLogs**: 32
- **Real Interaction Labels**: 9 (from genuine submitted applications)
- **Benchmark Training Samples**: 18 benchmark seed scenarios (27 total dataset samples: 21 training, 6 test)
- **Test Contamination**: Clean (0 test fixtures in active database/store)

---

## 16. Remaining ML Data Limitations

1. **Volume**: Real interaction count currently reflects application submissions and initial usage. More natural organic traffic is needed for pure-production model training.
2. **Negative Label Scarcity**: Real student users infrequently trigger explicit dismissals; negative samples in current benchmarks are primarily provided by benchmark seed scenarios.
3. **Diversity**: Current students in database span Computer Science, Information Technology, and Data Science. Cross-departmental diversity will expand as more students enroll.

---

## 17. Why Retraining Was Intentionally NOT Performed

Model retraining was intentionally omitted in Phase 9.5 because:
- The phase goal is **pipeline integrity and data collection readiness**, not model updating.
- Training immediately without genuine accumulated interaction volume would either reproduce the current benchmark model or overfit on early application samples.
- Preserving the Phase 9 Random Forest model guarantees architectural stability while real interaction streams accumulate naturally.
