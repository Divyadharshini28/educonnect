"""
Real-time Inference Script for EduConnect Random Forest ML Recommender.

Accepts JSON payload containing:
- student: Student profile object
- opportunities: Array of opportunity objects
- pastInteractions: Array of student's past interactions (optional)
- referenceTime: Reference timestamp (optional)

Outputs JSON predictions containing engagement probability for each opportunity.
"""

import argparse
import json
import os
import sys
from typing import Any, Dict, List

import joblib
import numpy as np

from feature_engineering import (
    FEATURE_NAMES,
    build_opportunity_document,
    extract_features,
    feature_dict_to_vector
)

DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "random_forest_model.joblib")
DEFAULT_META_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model_metadata.json")


def load_model_and_meta(model_path: str = DEFAULT_MODEL_PATH, meta_path: str = DEFAULT_META_PATH):
    """Load persisted Random Forest model and metadata."""
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model artifact not found at {model_path}")
    model = joblib.load(model_path)
    metadata = {}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except Exception:
            pass
    return model, metadata


def predict_opportunities(
    payload: Dict[str, Any],
    model_path: str = DEFAULT_MODEL_PATH,
    meta_path: str = DEFAULT_META_PATH
) -> Dict[str, Any]:
    """Generate engagement probability predictions for an array of opportunities."""
    student = payload.get("student") or {}
    opportunities = payload.get("opportunities") or []
    past_interactions = payload.get("pastInteractions") or payload.get("interactions") or []
    ref_time = payload.get("referenceTime")

    if not opportunities:
        return {
            "model": "RandomForestClassifier",
            "modelVersion": "1.0.0",
            "predictions": []
        }

    model, metadata = load_model_and_meta(model_path, meta_path)
    model_version = metadata.get("version", "1.0.0")

    # Build opportunity corpus for TF-IDF smoothing
    corpus = [build_opportunity_document(opp) for opp in opportunities]

    feature_dicts = []
    vectors = []
    opp_ids = []

    for opp in opportunities:
        opp_id = str(opp.get("_id") or opp.get("id") or "")
        opp_ids.append(opp_id)
        f_dict = extract_features(
            student=student,
            opportunity=opp,
            past_interactions=past_interactions,
            reference_time=ref_time,
            corpus_documents=corpus
        )
        feature_dicts.append(f_dict)
        vectors.append(feature_dict_to_vector(f_dict))

    X = np.array(vectors, dtype=np.float64)

    # Class 1 corresponds to positive engagement (APPLY/BOOKMARK)
    classes = list(model.classes_)
    pos_idx = classes.index(1) if 1 in classes else (len(classes) - 1)

    prob_matrix = model.predict_proba(X)
    probabilities = prob_matrix[:, pos_idx]

    predictions = []
    for i in range(len(opportunities)):
        prob = float(probabilities[i])
        # Ensure probability is strictly bounded in [0.0, 1.0]
        prob = max(0.0, min(1.0, prob))
        predictions.append({
            "opportunityId": opp_ids[i],
            "probability": round(prob, 4),
            "features": feature_dicts[i]
        })

    return {
        "model": "RandomForestClassifier",
        "modelVersion": model_version,
        "predictions": predictions
    }


def main():
    parser = argparse.ArgumentParser(description="Predict opportunity engagement using Random Forest")
    parser.add_argument("--input", default=None, help="Input JSON file or string (defaults to reading stdin)")
    parser.add_argument("--model", default=DEFAULT_MODEL_PATH, help="Path to joblib model artifact")
    parser.add_argument("--meta", default=DEFAULT_META_PATH, help="Path to metadata JSON artifact")

    args = parser.parse_args()

    try:
        if args.input:
            if os.path.exists(args.input):
                with open(args.input, "r", encoding="utf-8") as f:
                    payload = json.load(f)
            else:
                payload = json.loads(args.input)
        else:
            raw_input = sys.stdin.read()
            if not raw_input.strip():
                print(json.dumps({"error": "Empty input payload", "available": False}))
                sys.exit(1)
            payload = json.loads(raw_input)

        result = predict_opportunities(payload, model_path=args.model, meta_path=args.meta)
        print(json.dumps(result))
    except Exception as e:
        err_response = {
            "error": str(e),
            "available": False,
            "fallback": True
        }
        print(json.dumps(err_response), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
