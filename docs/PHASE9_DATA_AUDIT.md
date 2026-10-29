# Pre-Phase 10 — EduConnect ML Data Readiness & Database Audit Report

**Audit Date**: October 3, 2026  
**Auditor**: Antigravity Automated Verification Agent  
**Scope**: Complete read-only audit of persistence layers, student records, opportunities, applications, interaction tracking, and Random Forest ML dataset provenance.

---

## 1. Current Persistence Architecture

EduConnect utilizes a multi-layered persistence architecture:

1. **Active Primary Persistence**: Local MongoDB daemon (`mongodb://127.0.0.1:27017/educonnect`). If the local daemon is unreachable, the system automatically falls back to an in-memory MongoDB instance via `mongodb-memory-server`.
2. **Disk Store Synchronization & Recovery**: File-based persistent store at [`server/data/db_store.json`](file:///d:/MCA/educonnect/server/data/db_store.json). When the database starts up, `restoreFromDisk()` recovers registered students, catalog opportunities, applications, and interaction history. When mutations occur, `syncToDisk()` synchronizes state.
3. **Test Store Isolation**: In automated test environments (`NODE_ENV === 'test'`), file persistence redirects to `server/data/test_db_store.json`, preventing test state from corrupting development data.

---

## 2. Student Statistics

| Metric | Count / Value |
| :--- | :--- |
| **Total Registered Students** | **3** |
| **Students with $\ge 1$ interaction** | **0** (0.0%) |
| **Students with 0 recorded interactions** | **3** (100.0%) |
| **Students with $\ge 1$ application submission** | **3** (100.0%) |
| **Students with $\ge 1$ bookmark saved** | **0** (0.0%) |

### Department Distribution
* **Information Technology**: 2 students (66.7%)
* **Computer Science**: 1 student (33.3%)

### Academic Year Distribution
* **Year 3**: 2 students (66.7%)
* **Year 4**: 1 student (33.3%)

---

## 3. Opportunity Statistics

| Metric | Count / Value |
| :--- | :--- |
| **Total Opportunities in Active Catalog** | **12** (16 in persistent store) |
| **Active / Non-Expired Opportunities** | **12** (100.0%) |
| **Expired Opportunities** | **0** (0.0%) |

### Opportunity Type Distribution (Active Catalog)
* **Internship**: 3 (25.0%)
* **Scholarship**: 3 (25.0%)
* **Hackathon**: 3 (25.0%)
* **Certification**: 3 (25.0%)

### Opportunity Source Distribution
* **Internal Catalog Seed**: 12 (100.0% in active DB)
* **BodhDisha Synchronized**: 4 (Present in persistent store `db_store.json`)
* **Hopin / Brabble / Other External**: 0 active in primary DB

---

## 4. Application Statistics

| Metric | Count / Value |
| :--- | :--- |
| **Total Applications** | **9** |
| **Unique Students Who Applied** | **3** (100.0% of registered students) |
| **Unique Opportunities with Applications** | **6** (50.0% of active catalog) |

### Applications by Status
* **`Submitted`**: 9 (100.0%)
* **`Under Review`**: 0
* **`Accepted`**: 0
* **`Rejected`**: 0

### Applications by Opportunity Type
* **Internship**: 3 (33.3%)
* **Hackathon**: 3 (33.3%)
* **Scholarship**: 2 (22.2%)
* **Certification**: 1 (11.1%)

---

## 5. Interaction Statistics

Audit of the `Interaction` collection across active MongoDB and `db_store.json`:

| Interaction Type | Count | Description / Role in ML |
| :--- | :---: | :--- |
| **`VIEW`** | **0** | Exploratory detail view (excluded from direct labeling; historical behavioral feature) |
| **`CLICK`** | **0** | Outbound official URL click (excluded from direct labeling; historical behavioral feature) |
| **`BOOKMARK`** | **0** | Explicit positive interest (Phase 9 Label: `1`) |
| **`UNBOOKMARK`** | **0** | Neutral bookmark cancellation (excluded from direct labeling) |
| **`APPLY`** | **0** | Explicit application intent (Phase 9 Label: `1`) |
| **`DISMISS`** | **0** | Explicit negative rejection (Phase 9 Label: `0`) |
| **Other / Unknown** | **0** | Unrecognized event types |
| **Total Interactions** | **0** | Total interaction records in persistent store |

* **Unique Students Generating Interactions**: 0
* **Unique Opportunities Receiving Interactions**: 0
* **Average Interactions per Active Student**: 0.00

---

## 6. ML Label Distribution

Applying the Phase 9 Supervised ML Label Strategy:

* **Positive Interaction Events (`APPLY`, `BOOKMARK`)**: **0**
* **Negative Interaction Events (`DISMISS`)**: **0**
* **Excluded Exploratory Events (`VIEW`, `CLICK`, `UNBOOKMARK`)**: **0**
* **Authentic Application Submissions (`Application` Model)**: **9** (Derived as Label `1`)
* **Total Real Database Labeled Examples**: **9** (9 Positive, 0 Negative)

---

## 7. Training Dataset Provenance

Inspection of [`server/ml/data/training_data.json`](file:///d:/MCA/educonnect/server/ml/data/training_data.json) and [`mlDatasetGenerator.js`](file:///d:/MCA/educonnect/server/src/services/mlDatasetGenerator.js) reveals the exact composition of the **27 samples** used during Phase 9 model training:

```
Total Samples in Dataset: 27
  ├── Real Database Application Submissions:  9 samples (33.3%) [All Positive: Label 1]
  └── Benchmark Seed Scenarios:             18 samples (66.7%) [10 Positive: Label 1, 8 Negative: Label 0]
```

### Detailed Provenance Breakdown:
1. **Real Database Application Samples (9 samples)**:
   * Sourced directly from genuine `Application` records submitted by registered students (`Anu`, `Ananya Rao`, `Nivetha`).
   * Event type: `APPLICATION_SUBMISSION`, Label: `1`.
   * Opportunities: `AI & Data Science Intern`, `NSP Merit Scheme`, `Global Greentech Hackathon`, `MERN Developer Intern`, `Deep Learning Specialization`, `FinTech Sprint 2026`.
2. **Benchmark Seed Scenarios (18 samples)**:
   * Generated via `generateDeterministicSeedSamples()` in [`mlDatasetGenerator.js`](file:///d:/MCA/educonnect/server/src/services/mlDatasetGenerator.js) to fulfill the minimum sample threshold ($N \ge 10$) and class diversity requirement (at least 2 classes).
   * 6 synthetic student personas (`std_cs_3rd_year`, `std_ai_4th_year`, `std_it_2nd_year`, `std_mech_1st_year`, `std_ece_3rd_year`, `std_cs_low_cgpa`).
   * 6 catalog benchmark opportunities (`opp_fullstack_intern`, `opp_smart_hackathon`, `opp_high_honor_scholarship`, `opp_ai_research_intern`, `opp_national_scholarship`, `opp_devops_cloud`).
   * Label distribution: **10 positive** (`APPLY`: 6, `BOOKMARK`: 4) and **8 negative** (`DISMISS`: 8).

### Student & Opportunity Representation in Dataset:
* **Unique Students**: 9 (3 real database student profiles + 6 benchmark personas)
* **Unique Opportunities**: 12 (6 real catalog opportunities + 6 benchmark opportunities)

---

## 8. Test / Fixture Contamination Findings

An inspection of persistent collections was conducted to determine if temporary automated test runs (Phases 2 through 9) leaked fixture records into the primary database:

| Component | Status | Finding |
| :--- | :---: | :--- |
| **Test Student UIDs** (`p8-alice-uid`, `p9-alice-uid`, `test-bob`) | **Clean** | Zero test student records present in active MongoDB or `db_store.json`. |
| **Test Opportunities** (`Phase 8 Cloud Internship`, `Phase 9 Web Dev Intern`) | **Clean** | Temporary test opportunities are deleted by test cleanup hooks (`finally` blocks). |
| **Test Interactions** | **Clean** | No test interaction records persisted to `db_store.json`. |
| **Synchronized Opportunities** | **Present** | 4 BodhDisha opportunities persisted during Phase 6 sync runs (conforming to canonical schema). |

**Provenance Classification**: **Clean persistence store (0 test fixture contamination); training dataset utilizes a mixed provenance of real application records (33.3%) and deterministic benchmark scenarios (66.7%)**.

---

## 9. Model Metadata Cross-Check

Artifact cross-check between [`model_metadata.json`](file:///d:/MCA/educonnect/server/ml/artifacts/model_metadata.json), [`metrics.json`](file:///d:/MCA/educonnect/server/ml/artifacts/metrics.json), and [`train.py`](file:///d:/MCA/educonnect/server/ml/train.py):

* **Model Architecture**: `RandomForestClassifier (n_estimators=50, max_depth=5, class_weight="balanced", random_state=42)` — **Verified**
* **Training Sample Count**: 21 samples (80% stratified split of 27 samples) — **Verified**
* **Test Sample Count**: 6 samples (20% held-out test split) — **Verified**
* **Feature Schema**: Exact 14 features matching `FEATURE_NAMES` in [`feature_engineering.py`](file:///d:/MCA/educonnect/server/ml/feature_engineering.py) — **Verified**
* **Metrics Recorded**:
  * Accuracy: **0.8333**
  * Precision: **0.8000**
  * Recall: **1.0000**
  * F1 Score: **0.8889**
  * ROC-AUC: **1.0000**
  * Confusion Matrix: `[[1 (TN), 1 (FP)], [0 (FN), 4 (TP)]]`

**Verdict**: The persisted model artifacts accurately reflect the training execution on `training_data.json` with zero discrepancies or fabricated values.

---

## 10. Data Quality & Referential Integrity

* **Orphaned Applications**: **0** (All applications map to valid student and opportunity IDs).
* **Orphaned Interactions**: **0**.
* **Invalid Application Statuses**: **0** (All values are canonical `Submitted`).
* **Invalid Opportunity Types**: **0** (All match canonical enum values).
* **Future Timestamps / Temporal Anachronisms**: **0**.
* **Sensitive Credentials in ML Artifacts**: **0** (Passwords and private tokens are stripped).

---

## 11. ML Readiness Assessment

| Dimension | Readiness Rating | Rationale & Justification |
| :--- | :---: | :--- |
| **A. Student Data Readiness** | **Limited** | 3 registered student profiles exist. Sufficient for initial profile feature verification, but limited for broad demographic modeling. |
| **B. Interaction Data Readiness** | **Insufficient** | 0 interaction records currently stored in the `Interaction` collection. All behavioral signals currently come from application submissions. |
| **C. Positive Label Availability** | **Limited** | 9 positive labels derived from authentic application submissions. |
| **D. Negative Label Availability** | **Insufficient** | 0 explicit negative interaction signals (`DISMISS`) present in the real database. |
| **E. Training Dataset Quality** | **Mixed Production + Test** | 33.3% real application records + 66.7% benchmark seed scenarios. |

---

## 12. Retraining Recommendation

**Classification: Case 3 / Case 2 (Mixed Production + Benchmark Data)**

1. **Do NOT retrain the Random Forest model on purely production database records yet**:
   * The database currently contains 9 positive application records and 0 negative interaction records.
   * Supervised classification algorithms mathematically require at least two distinct classes ($y \in \{0, 1\}$) to fit decision boundaries and calculate probability estimates.
2. **Operational Role of the Current Model**:
   * The current Random Forest model (trained on the 27 mixed samples) is functioning as an operational pipeline and benchmark baseline.
   * Its measured performance metrics (Accuracy 83.33%, F1 0.8889) should be documented as **development/benchmark metrics**, not representative of large-scale production student behavior.
3. **Fail-Safe Mechanism**:
   * EduConnect's two-stage architecture ensures that if interaction data is sparse or the ML model is unavailable, the system seamlessly falls back to the **TF-IDF Cosine Similarity + Hard Eligibility Recommender**.
4. **Actionable Next Steps**:
   * Maintain the Phase 8 Interaction Tracking system in production to accumulate genuine user interactions (`VIEW`, `CLICK`, `BOOKMARK`, `APPLY`, and `DISMISS`).
   * Schedule the next model retraining once $\ge 20$ positive and $\ge 10$ negative authentic student interactions have been gathered.

---

## 13. Limitations

* **Absence of Real Negative Feedback**: Students have not yet performed explicit dismissals in the live app, necessitating benchmark negative scenarios to train the binary classifier.
* **Cold-Start Interactions**: Interaction tracking was introduced in Phase 8; historical applications submitted prior to Phase 8 exist without accompanying exploratory `VIEW` or `CLICK` timeline events.
