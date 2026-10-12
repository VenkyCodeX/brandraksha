from __future__ import annotations

import argparse
import json
from pathlib import Path

from model_utils import read_dataset

ROOT = Path(__file__).resolve().parent
DEFAULT_DATASET = ROOT / "data" / "raw" / "your_dataset.csv"
DEFAULT_REPORT = ROOT / "reports" / "dataset_report.json"
DATASET_SOURCE = 'Kaggle: Victus Adi, "Phishing URLs Dataset with Extracted Features"'
DATASET_URL = "https://www.kaggle.com/datasets/victusadi/phishing-urls-dataset-with-extracted-features"
DATASET_LICENSE = "CC0: Public Domain (as listed on the Kaggle dataset page)"


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and summarize the raw URL dataset.")
    parser.add_argument("--input", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(f"Dataset not found: {args.input}")
    _, _, _, metadata = read_dataset(args.input)
    metadata.update({
        "dataset_path": str(args.input),
        "dataset_source": DATASET_SOURCE,
        "dataset_url": DATASET_URL,
        "license": DATASET_LICENSE,
        "label_mapping": {"1": "phishing", "0": "benign"},
    })
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))
    print(f"Dataset report written to {args.report}")


if __name__ == "__main__":
    main()