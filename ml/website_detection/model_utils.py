from __future__ import annotations

from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from feature_extraction import CATEGORICAL_FEATURES, NUMERIC_FEATURES, validate_and_prepare

RANDOM_STATE = 42
N_SPLITS = 5
MODEL_VERSION = "url-risk-logistic-regression-v1"


def read_dataset(path: Path):
    frame = pd.read_csv(path, dtype={"url": "string", "label": "string", "tld": "string"})
    return validate_and_prepare(frame)


def make_group_split(features, labels, groups):
    splitter = StratifiedGroupKFold(n_splits=N_SPLITS, shuffle=True, random_state=RANDOM_STATE)
    for train_indices, test_indices in splitter.split(features, labels, groups):
        train_labels = set(labels.iloc[train_indices])
        test_labels = set(labels.iloc[test_indices])
        if len(train_labels) == 2 and len(test_labels) == 2:
            return train_indices, test_indices
    raise ValueError(
        "Could not create a hostname-grouped split containing both classes in train and test. "
        "Inspect label distribution by hostname before reducing N_SPLITS."
    )


def make_pipeline():
    numeric_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
        ("scaler", StandardScaler()),
    ])
    categorical_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="__missing__")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    preprocessing = ColumnTransformer([
        ("numeric", numeric_pipeline, NUMERIC_FEATURES),
        ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
    ])
    return Pipeline([
        ("preprocessing", preprocessing),
        ("classifier", LogisticRegression(class_weight="balanced", max_iter=3000, random_state=RANDOM_STATE)),
    ])


def calculate_metrics(y_true, y_pred, y_score, test_labels):
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "precision_positive": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall_positive": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_positive": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, y_score)),
        "confusion_matrix_labels_negative_positive": confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist(),
        "test_class_counts": {str(label): int((test_labels == label).sum()) for label in [0, 1]},
        "test_size": int(len(y_true)),
    }