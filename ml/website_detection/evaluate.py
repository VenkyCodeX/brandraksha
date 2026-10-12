from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib

from model_utils import calculate_metrics, make_group_split, read_dataset

ROOT = Path(__file__).resolve().parent
DEFAULT_DATASET = ROOT / "data" / "raw" / "your_dataset.csv"
DEFAULT_MODEL = ROOT / "artifacts" / "url_risk_pipeline.joblib"


def main() -> None:
    parser = argparse.ArgumentParser(description="Re-evaluate a saved model on the deterministic hostname-grouped test fold.")
    parser.add_argument("--input", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    args = parser.parse_args()

    artifact = joblib.load(args.model)
    features, raw_labels, groups, _ = read_dataset(args.input)
    positive_label = artifact["positive_label"]
    if positive_label not in set(raw_labels.unique()):
        raise SystemExit(f"Saved positive label {positive_label!r} is not present in this dataset.")
    binary_labels = (raw_labels == positive_label).astype(int)
    _, test_indices = make_group_split(features, binary_labels, groups)
    pipeline = artifact["pipeline"]
    predictions = pipeline.predict(features.iloc[test_indices])
    positive_column = list(pipeline.named_steps["classifier"].classes_).index(1)
    scores = pipeline.predict_proba(features.iloc[test_indices])[:, positive_column]
    report = calculate_metrics(binary_labels.iloc[test_indices], predictions, scores, binary_labels.iloc[test_indices])
    print(json.dumps({"model_version": artifact["model_version"], "metrics": report}, indent=2))


if __name__ == "__main__":
    main()