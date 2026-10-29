"""
Random Forest Training Pipeline for EduConnect Recommendation Engine.

Loads student-opportunity interaction training samples, performs feature engineering,
executes stratified train/test split, trains a RandomForestClassifier, evaluates performance
metrics, and persists model artifacts and evaluation summaries.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score
)
from sklearn.model_selection import train_test_split

from feature_engineering import (
    FEATURE_NAMES,
    build_opportunity_document,
    extract_feature_vector
)

DEFAULT_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "training_data.json")
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "random_forest_model.joblib")
DEFAULT_METRICS_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "metrics.json")
DEFAULT_META_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model_metadata.json")
MIN_ML_TRAINING_SAMPLES = int(os.environ.get("MIN_ML_TRAINING_SAMPLES", 10))


def load_dataset(data_path: str) -> List[Dict[str, Any]]:
    """Load JSON training dataset."""
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Training data file not found at: {data_path}")
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict) and "samples" in data:
        return data["samples"]
    if isinstance(data, list):
        return data
    raise ValueError("Invalid training data format. Expected a JSON array or object with 'samples' key.")


def prepare_features_and_labels(samples: List[Dict[str, Any]]) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """Convert raw training samples into feature matrix X and label vector y."""
    # Build opportunity corpus for TF-IDF smoothing if opportunities are provided
    corpus = []
    for s in samples:
        opp = s.get("opportunity")
        if opp:
            corpus.append(build_opportunity_document(opp))

    X_list = []
    y_list = []

    for item in samples:
        student = item.get("student") or {}
        opportunity = item.get("opportunity") or {}
        past_interactions = item.get("pastInteractions") or []
        ref_time = item.get("referenceTime")
        label = item.get("label")

        if label is None:
            continue

        feat_vec = extract_feature_vector(
            student=student,
            opportunity=opportunity,
            past_interactions=past_interactions,
            reference_time=ref_time,
            corpus_documents=corpus
        )

        X_list.append(feat_vec)
        y_list.append(int(label))

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.int64)
    return X, y, FEATURE_NAMES


def train_and_evaluate(
    data_path: str = DEFAULT_DATA_PATH,
    model_path: str = DEFAULT_MODEL_PATH,
    metrics_path: str = DEFAULT_METRICS_PATH,
    meta_path: str = DEFAULT_META_PATH,
    min_samples: int = MIN_ML_TRAINING_SAMPLES,
    random_state: int = 42
) -> Dict[str, Any]:
    """Execute the complete training and evaluation pipeline."""
    print("=" * 60)
    print("EduConnect ML Pipeline: Training Random Forest Recommender")
    print("=" * 60)

    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    os.makedirs(os.path.dirname(metrics_path), exist_ok=True)
    os.makedirs(os.path.dirname(meta_path), exist_ok=True)

    try:
        samples = load_dataset(data_path)
    except Exception as e:
        print(f"[WARN] Could not load dataset: {e}")
        samples = []

    total_samples = len(samples)
    print(f"Loaded {total_samples} raw training samples from {data_path}.")

    # Check minimum training data threshold
    if total_samples < min_samples:
        status_msg = f"Insufficient training samples ({total_samples} < required {min_samples}). Retaining rule/cosine fallback."
        print(f"[STATUS] {status_msg}")
        
        metrics_payload = {
            "model": "RandomForestClassifier",
            "status": "insufficient_training_data",
            "reason": status_msg,
            "training_samples": total_samples,
            "test_samples": 0,
            "features": FEATURE_NAMES,
            "accuracy": None,
            "precision": None,
            "recall": None,
            "f1": None,
            "roc_auc": None,
            "confusion_matrix": None,
            "trained_at": None,
            "available": False
        }
        with open(metrics_path, "w", encoding="utf-8") as f:
            json.dump(metrics_payload, f, indent=2)
        return metrics_payload

    X, y, feature_names = prepare_features_and_labels(samples)

    if len(y) < min_samples:
        status_msg = f"Valid labeled samples ({len(y)}) is below threshold ({min_samples})."
        print(f"[STATUS] {status_msg}")
        metrics_payload = {
            "model": "RandomForestClassifier",
            "status": "insufficient_training_data",
            "reason": status_msg,
            "training_samples": len(y),
            "test_samples": 0,
            "features": feature_names,
            "accuracy": None,
            "precision": None,
            "recall": None,
            "f1": None,
            "roc_auc": None,
            "confusion_matrix": None,
            "trained_at": None,
            "available": False
        }
        with open(metrics_path, "w", encoding="utf-8") as f:
            json.dump(metrics_payload, f, indent=2)
        return metrics_payload

    unique_classes, counts = np.unique(y, return_counts=True)
    class_dist = {int(k): int(v) for k, v in zip(unique_classes, counts)}
    print(f"Dataset Class Distribution: {class_dist} (0=Dismissed/Negative, 1=Applied/Bookmarked)")

    if len(unique_classes) < 2:
        status_msg = "Dataset contains only one class. Supervised classification requires both positive and negative engagement examples."
        print(f"[STATUS] {status_msg}")
        metrics_payload = {
            "model": "RandomForestClassifier",
            "status": "single_class_only",
            "reason": status_msg,
            "training_samples": len(y),
            "test_samples": 0,
            "features": feature_names,
            "accuracy": None,
            "precision": None,
            "recall": None,
            "f1": None,
            "roc_auc": None,
            "confusion_matrix": None,
            "trained_at": None,
            "available": False
        }
        with open(metrics_path, "w", encoding="utf-8") as f:
            json.dump(metrics_payload, f, indent=2)
        return metrics_payload

    # Stratified Train/Test Split
    min_class_count = min(counts)
    stratify_param = y if min_class_count >= 2 else None
    test_size = 0.20 if len(y) >= 20 else (0.25 if len(y) >= 8 else 0.5)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=test_size,
        random_state=random_state,
        stratify=stratify_param
    )

    print(f"Split Dataset: Train={len(X_train)} samples, Test={len(X_test)} samples (Test size: {test_size:.0%})")

    # Initialize and Train Random Forest Classifier
    # Chosen defaults suitable for small tabular student-opportunity features
    model = RandomForestClassifier(
        n_estimators=50,
        max_depth=5,
        min_samples_split=2,
        min_samples_leaf=1,
        random_state=random_state,
        class_weight="balanced"
    )

    model.fit(X_train, y_train)

    # Evaluate on held-out test set
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1] if model.n_classes_ > 1 else np.zeros(len(y_test))

    accuracy = float(accuracy_score(y_test, y_pred))
    precision = float(precision_score(y_test, y_pred, zero_division=0))
    recall = float(recall_score(y_test, y_pred, zero_division=0))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))

    # ROC-AUC requires both classes present in the test split
    if len(np.unique(y_test)) > 1:
        roc_auc = float(roc_auc_score(y_test, y_prob))
    else:
        roc_auc = None

    cm = confusion_matrix(y_test, y_pred).tolist()

    # Feature importances
    feature_importances = {}
    for name, imp in zip(feature_names, model.feature_importances_):
        feature_importances[name] = float(round(imp, 4))

    # Sort feature importances descending
    sorted_importances = dict(sorted(feature_importances.items(), key=lambda x: x[1], reverse=True))

    training_time_iso = datetime.now(timezone.utc).isoformat()

    metrics_payload = {
        "model": "RandomForestClassifier",
        "status": "trained",
        "available": True,
        "trained_at": training_time_iso,
        "training_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "total_samples": int(len(y)),
        "class_distribution": class_dist,
        "features": feature_names,
        "feature_importances": sorted_importances,
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "roc_auc": round(roc_auc, 4) if roc_auc is not None else None,
        "confusion_matrix": cm
    }

    metadata_payload = {
        "model": "RandomForestClassifier",
        "version": "1.0.0",
        "trained_at": training_time_iso,
        "features": feature_names,
        "n_estimators": 50,
        "max_depth": 5,
        "random_state": random_state,
        "class_weight": "balanced",
        "training_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "metrics": {
            "accuracy": metrics_payload["accuracy"],
            "precision": metrics_payload["precision"],
            "recall": metrics_payload["recall"],
            "f1": metrics_payload["f1"],
            "roc_auc": metrics_payload["roc_auc"]
        },
        "label_strategy": {
            "positive_label_1": ["APPLY", "BOOKMARK", "Submitted Application"],
            "negative_label_0": ["DISMISS", "Explicit Dismissal"],
            "neutral_excluded": ["VIEW", "CLICK"]
        }
    }

    # Persist artifacts
    joblib.dump(model, model_path)
    print(f"Persisted trained model to: {model_path}")

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)
    print(f"Persisted evaluation metrics to: {metrics_path}")

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata_payload, f, indent=2)
    print(f"Persisted model metadata to: {meta_path}")

    print("\n--- Actual Evaluation Metrics on Held-Out Test Set ---")
    print(f"Accuracy:  {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1 Score:  {f1:.4f}")
    print(f"ROC-AUC:   {roc_auc if roc_auc is not None else 'N/A (Single class in test slice)'}")
    print(f"Confusion Matrix: {cm}")
    print(f"Top 3 Features: {list(sorted_importances.items())[:3]}")
    print("=" * 60)

    return metrics_payload


def main():
    parser = argparse.ArgumentParser(description="Train EduConnect Random Forest ML Recommender")
    parser.add_argument("--data", default=DEFAULT_DATA_PATH, help="Path to training data JSON")
    parser.add_argument("--model-out", default=DEFAULT_MODEL_PATH, help="Output path for joblib model")
    parser.add_argument("--metrics-out", default=DEFAULT_METRICS_PATH, help="Output path for metrics JSON")
    parser.add_argument("--meta-out", default=DEFAULT_META_PATH, help="Output path for metadata JSON")
    parser.add_argument("--min-samples", type=int, default=MIN_ML_TRAINING_SAMPLES, help="Minimum training samples threshold")
    parser.add_argument("--random-state", type=int, default=42, help="Random seed for reproducibility")

    args = parser.parse_args()

    train_and_evaluate(
        data_path=args.data,
        model_path=args.model_out,
        metrics_path=args.metrics_out,
        meta_path=args.meta_out,
        min_samples=args.min_samples,
        random_state=args.random_state
    )


if __name__ == "__main__":
    main()
