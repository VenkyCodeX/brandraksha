# Website URL Risk Baseline

This workspace trains an experimental URL-phishing classifier from the precomputed features in `data/raw/your_dataset.csv`. It is a dataset baseline, not a brand-impersonation detector and not proof that any URL is fraudulent.

## Dataset status

The CSV is the Kaggle dataset [Phishing URLs Dataset with Extracted Features](https://www.kaggle.com/datasets/victusadi/phishing-urls-dataset-with-extracted-features) by Victus Adi. Its dataset card lists **CC0: Public Domain** and defines label `1 = Phishing`, `0 = Benign`. It describes phishing URL sources as OpenPhish, URLhaus, and PhishTank, and benign sources as Alexa Top Sites/popular verified domains.

The CSV currently has these columns:

```text
url,label,url_length,num_dots,has_https,has_ip,num_subdirs,num_params,suspicious_words,tld,special_char_count,digits_count,entropy
```

There are 160,064 rows in the supplied file. The observed labels are 0 and 1, with 1 overwhelmingly more common. The scripts default to `1` as the positive/phishing class according to the dataset card. Exact source snapshots, collection dates, and detailed feature-extraction formulas are not included in the CSV, so those remain reproducibility limitations.

Only the supplied numeric feature columns and `tld` are used for modeling. Raw URL text is used only to group rows by hostname during splitting and to identify duplicate URLs. Exact duplicate URLs with conflicting labels stop the workflow; same-label duplicates are removed.

## Setup

From the repository root, create an isolated environment and install the requirements:

```powershell
py -3 -m venv ml/website_detection/.venv
ml/website_detection/.venv/Scripts/python.exe -m pip install --upgrade pip
ml/website_detection/.venv/Scripts/python.exe -m pip install -r ml/website_detection/requirements.txt
```

If the CSV is not present, download the selected Kaggle dataset yourself, verify its license and schema, and place the CSV at `ml/website_detection/data/raw/your_dataset.csv`. Do not commit private Kaggle credentials or datasets whose license does not permit redistribution.

## Prepare and train

Validate the CSV columns, duplicate labels, counts, and hostname groups:

```powershell
ml/website_detection/.venv/Scripts/python.exe ml/website_detection/prepare_dataset.py
```

Train and evaluate a class-weighted Logistic Regression baseline:

```powershell
ml/website_detection/.venv/Scripts/python.exe ml/website_detection/train.py --positive-label 1
```

The deterministic split uses `StratifiedGroupKFold` grouped by full hostname to reduce hostname overlap between training and test data. Numeric values are median-imputed and standardized; `tld` is imputed and one-hot encoded. Missing or unknown TLD values are handled by the pipeline. The positive class weight is balanced for the observed class skew.

Training writes the preprocessing/model pipeline to `artifacts/url_risk_pipeline.joblib` and the dataset summary/evaluation metrics to `reports/`. Generated artifacts and reports are git-ignored.

Metrics include precision, recall, F1, balanced accuracy, ROC AUC, confusion matrix, test class counts, and test-set size. Accuracy is included only as supplemental context. If a valid group split with both classes cannot be formed, training stops rather than silently switching to a random split.

Re-evaluate the saved model on the same deterministic held-out hostname fold:

```powershell
ml/website_detection/.venv/Scripts/python.exe ml/website_detection/evaluate.py
```

## Prediction

`predict.py` accepts a JSON object containing every precomputed feature column. It does **not** derive those features from a raw URL, because the exact feature-generation definitions and provenance were not included with this CSV.

```powershell
ml/website_detection/.venv/Scripts/python.exe ml/website_detection/predict.py --features-json path/to/features.json
```

The workspace includes a smoke-test payload at `ml/website_detection/examples/sample_features.json`:

```powershell
ml/website_detection/.venv/Scripts/python.exe ml/website_detection/predict.py --features-json ml/website_detection/examples/sample_features.json
```

The response includes the model version, positive/negative class prediction, an uncalibrated score, threshold, and largest linear feature contributions. The score is not a calibrated probability. No Express or website-analysis endpoint calls this model yet; integrate it only after confirming label semantics and reviewing held-out results.

## Tests and limitations

Run the preprocessing tests:

```powershell
ml/website_detection/.venv/Scripts/python.exe -m unittest discover -s ml/website_detection -p "test_*.py"
```

This dataset is strongly imbalanced and may contain collection/source bias. Hostname grouping reduces one form of leakage but does not eliminate all temporal, campaign, or related-domain leakage. URL-phishing labels do not directly represent brand impersonation, and precomputed features may have dataset-specific semantics. Review source, license, feature definitions, and model metrics before using predictions.