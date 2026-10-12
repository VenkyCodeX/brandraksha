from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT / "artifacts" / "url_risk_pipeline.joblib"
LIMITATIONS = [
    "This experimental model predicts the dataset's URL-phishing label, not brand-specific impersonation.",
    "Its score is uncalibrated and is not a probability or proof of fraud.",
    "Provide the same precomputed feature definitions used by the training CSV; raw URL feature extraction is not included.",
]


def predict_features(artifact: dict, feature_values: dict) -> dict:
    required = artifact["feature_columns"]
    missing = [feature for feature in required if feature not in feature_values]
    if missing:
        raise ValueError(f"Missing model features: {', '.join(missing)}")
    row = pd.DataFrame([{feature: feature_values[feature] for feature in required}])
    pipeline = artifact["pipeline"]
    prediction = int(pipeline.predict(row)[0])
    positive_column = list(pipeline.named_steps["classifier"].classes_).index(1)
    positive_score = float(pipeline.predict_proba(row)[0, positive_column])

    transformed = pipeline.named_steps["preprocessing"].transform(row)
    if hasattr(transformed, "toarray"):
        transformed = transformed.toarray()
    feature_names = pipeline.named_steps["preprocessing"].get_feature_names_out()
    contributions = transformed[0] * pipeline.named_steps["classifier"].coef_[0]
    ranked = np.argsort(np.abs(contributions))[::-1][:5]
    top_features = [
        {"feature": str(feature_names[index]), "contribution": float(contributions[index])}
        for index in ranked
        if contributions[index] != 0
    ]

    return {
        "modelVersion": artifact["model_version"],
        "prediction": "positive_class" if prediction == 1 else "negative_class",
        "positiveLabel": artifact["positive_label"],
        "riskIndicator": "REVIEW" if prediction == 1 else "NOT_FLAGGED",
        "uncalibratedPositiveScore": positive_score,
        "threshold": artifact["threshold"],
        "topFeatureContributions": top_features,
        "limitations": LIMITATIONS,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run URL-risk inference from precomputed CSV-schema features.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--features-json", type=Path, required=True, help="JSON object containing all model feature columns.")
    args = parser.parse_args()
    artifact = joblib.load(args.model)
    features = json.loads(args.features_json.read_text(encoding="utf-8"))
    print(json.dumps(predict_features(artifact, features), indent=2))


if __name__ == "__main__":
    main()