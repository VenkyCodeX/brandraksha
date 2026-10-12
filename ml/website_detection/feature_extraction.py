from __future__ import annotations

from urllib.parse import urlsplit

import pandas as pd

LABEL_COLUMN = "label"
URL_COLUMN = "url"
NUMERIC_FEATURES = [
    "url_length",
    "num_dots",
    "has_https",
    "has_ip",
    "num_subdirs",
    "num_params",
    "suspicious_words",
    "special_char_count",
    "digits_count",
    "entropy",
]
CATEGORICAL_FEATURES = ["tld"]
MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
REQUIRED_COLUMNS = [URL_COLUMN, LABEL_COLUMN, *MODEL_FEATURES]


def hostname_group(url: str) -> str:
    """Return the normalized full hostname used to keep that host in one split."""
    candidate = url.strip()
    if not candidate:
        raise ValueError("Dataset contains an empty URL.")
    parsed = urlsplit(candidate if "://" in candidate else f"//{candidate}")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError(f"Could not parse a hostname from URL: {candidate!r}")
    return hostname.lower().rstrip(".")


def validate_and_prepare(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.Series, dict]:
    """Validate supplied precomputed columns and return features, labels, host groups, metadata."""
    missing_columns = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing_columns)}")

    dataset = frame[REQUIRED_COLUMNS].copy()
    dataset[URL_COLUMN] = dataset[URL_COLUMN].fillna("").astype(str).str.strip()
    dataset[LABEL_COLUMN] = dataset[LABEL_COLUMN].fillna("").astype(str).str.strip()
    if dataset[URL_COLUMN].eq("").any():
        raise ValueError("Dataset contains rows with an empty URL.")
    if dataset[LABEL_COLUMN].eq("").any():
        raise ValueError("Dataset contains rows with a missing label.")

    labels_per_url = dataset.groupby(URL_COLUMN, dropna=False)[LABEL_COLUMN].nunique()
    conflicting_urls = labels_per_url[labels_per_url > 1]
    if not conflicting_urls.empty:
        raise ValueError(f"Dataset has {len(conflicting_urls)} URLs with conflicting labels.")

    input_rows = len(dataset)
    duplicate_rows = int(dataset.duplicated(subset=[URL_COLUMN], keep="first").sum())
    dataset = dataset.drop_duplicates(subset=[URL_COLUMN], keep="first").reset_index(drop=True)

    for column in NUMERIC_FEATURES:
        dataset[column] = pd.to_numeric(dataset[column], errors="coerce")
    dataset["tld"] = dataset["tld"].fillna("__missing__").astype(str).str.strip().str.lower()
    dataset.loc[dataset["tld"].eq(""), "tld"] = "__missing__"

    labels = dataset[LABEL_COLUMN]
    if labels.nunique() != 2:
        raise ValueError(f"Expected exactly two label classes; found {labels.nunique()}.")

    groups = dataset[URL_COLUMN].map(hostname_group)
    mixed_label_host_count = int(pd.DataFrame({"host": groups, "label": labels}).groupby("host")["label"].nunique().gt(1).sum())
    metadata = {
        "input_rows": input_rows,
        "rows_after_exact_url_deduplication": len(dataset),
        "duplicate_url_rows_removed": duplicate_rows,
        "hostname_group_count": int(groups.nunique()),
        "hostnames_with_multiple_labels": mixed_label_host_count,
        "label_counts": {str(label): int(count) for label, count in labels.value_counts().sort_index().items()},
        "feature_columns": MODEL_FEATURES,
    }

    features = dataset[MODEL_FEATURES].copy()
    return features, labels.reset_index(drop=True), groups.reset_index(drop=True), metadata