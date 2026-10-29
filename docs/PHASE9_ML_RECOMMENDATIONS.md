# Phase 9: Supervised Random Forest Recommendation System for EduConnect

## 1. Overview and Rationale

EduConnect incorporates a **supervised machine learning recommendation system** using a **Random Forest Classifier** (`RandomForestClassifier` from `scikit-learn`).

### Why Random Forest?
Random Forest was selected because EduConnect's recommendation task is formulated as estimating the probability of a student engaging positively with an eligible opportunity using structured tabular features. In this environment:
* Features are heterogeneous (academic qualifications, skill overlap ratios, interest keyword matching, historical interaction counts, opportunity timing, and semantic cosine similarity).
* Decision trees naturally capture non-linear feature interactions (such as the combined effect of academic cutoff thresholds and domain skill alignment) without requiring strong feature scaling assumptions.
* Random Forests mitigate individual decision tree variance through bagging and random feature subsampling, performing reliably on tabular datasets.

> **Academic Note**: We do not claim Random Forest is mathematically or universally the "best" algorithm for all recommendation problems. Its selection is grounded in empirical suitability for structured tabular student-opportunity features with transparent feature attribution and probability estimation (`predict_proba`).

---

## 2. Recommendation Architecture

The complete recommendation pipeline follows a two-stage architecture:

```
                    Student Profile
                          │
                          │
  External APIs ──→  Opportunities
                          │
                          │
                          ▼
                 Eligibility Filter (Hard Gates)
                          │
                          ▼
                 Feature Engineering (14 Features)
                          │
              ┌───────────┴────────────┐
              │                        │
              ▼                        ▼
     Historical Interactions     Cosine Similarity
     (Prior Engagement Events)    (TF-IDF Vector Space)
              │                        │
              └───────────┬────────────┘
                          ▼
                   Feature Vector
                          │
                          ▼
                 Random Forest Model
                 (scikit-learn Pipeline)
                          │
                          ▼
                Engagement Probability
                          │
                          ▼
                    Ranking Engine
              (Eligible items sorted by prob.)
                          │
                          ▼
                Personalized Results
                          │
                          ▼
                     React UI
```

---

## 3. Label Strategy

To maintain academic and empirical integrity, training labels are derived from authentic student engagement signals without artificial fabrication:

| Engagement Action | Label | Justification |
| :--- | :---: | :--- |
| **`APPLY`** / **Application Submission** | `1` (Positive) | Strongest signal of student intent and willingness to pursue the opportunity. |
| **`BOOKMARK`** | `1` (Positive) | Explicit positive interest and intent to save for later action. |
| **`DISMISS`** | `0` (Negative) | Explicit student action rejecting or hiding an opportunity. |
| **`VIEW`** / **`CLICK`** | *Excluded from Direct Labeling* | A view or click represents exploratory discovery; it does not indicate whether the student liked or disliked the opportunity. Views and clicks are retained as *historical behavioral features* for subsequent events. |

### Minimum Data Safeguard
If the training dataset contains fewer labeled samples than `MIN_ML_TRAINING_SAMPLES` (default threshold: 10) or lacks class diversity (only positive or only negative examples), the training pipeline marks status as `insufficient_training_data`, retains the TF-IDF Cosine Similarity / Rule-based engine as an operational fallback, and exposes status via `/api/recommendations/ml-status`.

---

## 4. Feature Engineering (14 Deterministic Features)

Features are extracted using a unified Python module ([`feature_engineering.py`](file:///d:/MCA/educonnect/server/ml/feature_engineering.py)), ensuring feature definition consistency across training, testing, and live API inference.

| Index | Feature Name | Type / Range | Description |
| :---: | :--- | :---: | :--- |
| 1 | `departmentMatch` | Float [0.0, 1.0] | 1.0 if student's branch is in opportunity's eligible branches or branch is open to all (`'All'`); 0.0 otherwise. |
| 2 | `yearEligible` | Float [0.0, 1.0] | 1.0 if student's year meets or exceeds `minYear`; 0.0 otherwise. |
| 3 | `cgpaEligible` | Float [0.0, 1.0] | 1.0 if student's CGPA meets or exceeds `minCGPA`; 0.0 otherwise. |
| 4 | `cgpaDiff` | Float | Academic buffer margin: `student.cgpa - opp.minCGPA`. |
| 5 | `skillMatchRatio` | Float [0.0, 1.0] | Fraction of opportunity required skills possessed by the student (1.0 for open-skill entries). |
| 6 | `interestMatchRatio` | Float [0.0, 1.0] | Overlap ratio of student interests against opportunity tags, category, and text keywords. |
| 7 | `typeMatch` | Float [0.0, 1.0] | 1.0 if student's interests explicitly mention the opportunity type (e.g. "internship", "hackathon"); 0.0 otherwise. |
| 8 | `modeMatch` | Float [0.0, 1.0] | Accessibility factor: 1.0 for Online / Hybrid / Remote, 0.7 for In-Person. |
| 9 | `hasPriorInteraction` | Float [0.0, 1.0] | 1.0 if student interacted with this opportunity prior to reference timestamp; 0.0 otherwise. |
| 10 | `priorInteractionCount` | Float [$\ge 0$] | Number of recorded student interactions with this opportunity prior to reference timestamp. |
| 11 | `hasBookmarked` | Float [0.0, 1.0] | 1.0 if student bookmarked this opportunity prior to reference timestamp; 0.0 otherwise. |
| 12 | `hasApplied` | Float [0.0, 1.0] | 1.0 if student applied to this opportunity prior to reference timestamp; 0.0 otherwise. |
| 13 | `deadlineDays` | Float | Days remaining until application deadline. **Missing deadlines are represented as `-1.0` (never hallucinated as future dates)**. |
| 14 | `semanticCosineSim` | Float [0.0, 1.0] | TF-IDF Cosine Similarity between weighted student document and opportunity catalog document. *(Cosine similarity is an input feature, not the final algorithm)*. |

### Strict Anti-Leakage Timeline Protection
For any target interaction event at timestamp $T$, behavioral features (`hasPriorInteraction`, `priorInteractionCount`, `hasBookmarked`, `hasApplied`) are computed strictly using interaction events occurring *prior to $T$* ($t < T$).

---

## 5. Model Training & Evaluation Metrics

The model is trained using stratified train/test partitioning ($80\%$ training, $20\%$ held-out test evaluation).

### Actual Measured Metrics (from [`metrics.json`](file:///d:/MCA/educonnect/server/ml/artifacts/metrics.json))

```json
{
  "model": "RandomForestClassifier",
  "status": "trained",
  "available": true,
  "training_samples": 21,
  "test_samples": 6,
  "total_samples": 27,
  "class_distribution": {
    "0": 8,
    "1": 19
  },
  "accuracy": 0.8333,
  "precision": 0.8,
  "recall": 1.0,
  "f1": 0.8889,
  "roc_auc": 1.0,
  "confusion_matrix": [
    [1, 1],
    [0, 4]
  ],
  "feature_importances": {
    "cgpaDiff": 0.1932,
    "semanticCosineSim": 0.18,
    "yearEligible": 0.129,
    "departmentMatch": 0.1109,
    "deadlineDays": 0.0925,
    "cgpaEligible": 0.0887,
    "interestMatchRatio": 0.0771,
    "skillMatchRatio": 0.0743,
    "typeMatch": 0.0348,
    "hasPriorInteraction": 0.0132,
    "priorInteractionCount": 0.0062,
    "modeMatch": 0.0,
    "hasBookmarked": 0.0,
    "hasApplied": 0.0
  }
}
```

---

## 6. Node.js ↔ Python Integration & Fallback Strategy

* **Inference Pipeline**: The Node.js service [`rfRecommenderService.js`](file:///d:/MCA/educonnect/server/src/services/rfRecommenderService.js) spawns a subprocess running `predict.py`, communicating via standard JSON streams.
* **Fail-Safe Fallback**: If Python is missing, the model file is not found, the inference process encounters an error, or the request times out (10s threshold), the system automatically logs:
  `[ML Recommendation] Notice: ML recommendation unavailable. Using existing recommendation fallback.`
  and seamlessly generates recommendations using the TF-IDF Cosine Similarity / Rule-based engine without breaking user workflows or throwing HTTP 500 errors.

---

## 7. API Endpoints

### 1. `GET /opportunities/recommended`
* Protected by Firebase authentication.
* Returns personalized opportunity recommendations sorted descending by Random Forest engagement probability.
* Preserves full backward compatibility with frontend contracts.

### 2. `GET /api/recommendations/ml-status`
* Returns ML operational availability, training timestamps, sample counts, feature importances, and evaluation metrics.

### 3. `GET /api/recommendations/compare`
* Evaluates all catalog opportunities across the Random Forest Recommender, TF-IDF Cosine Similarity model, and Rule-based engine side-by-side for comparative study.

---

## 8. How to Retrain the Model

To generate updated training data from interactions and retrain the Random Forest model:

```bash
npm run train:ml
```

or directly within the `server/` directory:

```bash
cd server
npm run train:ml
```

The script:
1. Queries student profiles, opportunities, interactions, and applications.
2. Extracts anti-leakage historical feature samples to `server/ml/data/training_data.json`.
3. Fits the `RandomForestClassifier`.
4. Evaluates performance against a held-out test split.
5. Saves model artifacts to `server/ml/artifacts/random_forest_model.joblib`.
6. Saves metric summaries to `server/ml/artifacts/metrics.json` and `model_metadata.json`.
