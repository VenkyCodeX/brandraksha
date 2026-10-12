from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib

from feature_extraction import MODEL_FEATURES
from model_utils import MODEL_VERSION, calculate_metrics, make_group_split, make_pipeline, read_dataset

ROOT = Path(__file__).resolve().parent
DEFAULT_DATASET = ROOT / "data" / "raw" / "your_dataset.csv"
DEFAULT_MODEL = ROOT / "artifacts" / "url_risk_pipeline.joblib"
DEFAULT_REPORT = ROOT / "reports" / "evaluation.json"
DATASET_SOURCE = 'Kaggle: Victus Adi, "Phishing URLs Dataset with Extracted Features"'
DATASET_URL = "https://www.kaggle.com/datasets/victusadi/phishing-urls-dataset-with-extracted-features"
DATASET_LICENSE = "CC0: Public Domain (as listed on the Kaggle dataset page)"


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate the URL risk baseline.")
    parser.add_argument("--input", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--positive-label", default="1", help="Raw CSV label that means phishing/suspicious; verify against dataset documentation.")
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(f"Dataset not found: {args.input}")

    features, raw_labels, groups, dataset_metadata = read_dataset(args.input)
    labels = set(raw_labels.unique())
    if args.positive_label not in labels:
        raise SystemExit(f"Positive label {args.positive_label!r} not found; available labels: {sorted(labels)}")
    negative_labels = labels - {args.positive_label}
    if len(negative_labels) != 1:
        raise SystemExit("Expected exactly one negative class after selecting --positive-label.")
    negative_label = next(iter(negative_labels))
    binary_labels = (raw_labels == args.positive_label).astype(int)

    train_indices, test_indices = make_group_split(features, binary_labels, groups)
    pipeline = make_pipeline()
    pipeline.fit(features.iloc[train_indices], binary_labels.iloc[train_indices])
    predictions = pipeline.predict(features.iloc[test_indices])
    positive_column = list(pipeline.named_steps["classifier"].classes_).index(1)
    scores = pipeline.predict_proba(features.iloc[test_indices])[:, positive_column]
    metrics = calculate_metrics(
        binary_labels.iloc[test_indices],
        predictions,
        scores,
        binary_labels.iloc[test_indices],
    )

    report = {
        "model_version": MODEL_VERSION,
        "model_type": "class-weighted Logistic Regression",
        "dataset_path": str(args.input),
        "dataset_source": DATASET_SOURCE,
        "dataset_url": DATASET_URL,
        "dataset_license": DATASET_LICENSE,
        "raw_label_mapping": {"positive_phishing_label": args.positive_label, "negative_legitimate_label": negative_label},
        "label_mapping_source": DATASET_URL,
        "split": "5-fold StratifiedGroupKFold; one deterministic fold held out by full hostname",
        "random_state": 42,
        "feature_columns": MODEL_FEATURES,
        "class_weight": "balanced",
        "dataset": dataset_metadata,
        "metrics": metrics,
        "limitations": [
            "The Kaggle dataset card lists CC0 and defines label 1 as phishing and label 0 as benign; exact collection snapshots and detailed feature-extraction formulas are not included in the CSV.",
            "URL-phishing labels do not specifically identify brand impersonation.",
            "Scores and predictions are experimental and are not proof of fraud.",
            "Logistic Regression scores are not calibrated probabilities.",
        ],
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    artifact = {
        "model_version": MODEL_VERSION,
        "positive_label": args.positive_label,
        "negative_label": negative_label,
        "feature_columns": MODEL_FEATURES,
        "threshold": 0.5,
        "pipeline": pipeline,
        "evaluation": report,
    }
    args.model.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, args.model)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Model saved to {args.model}")
    print(f"Evaluation report saved to {args.report}")


if __name__ == "__main__":
    main()