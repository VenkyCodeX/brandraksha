# BrandProtect AI

BrandProtect AI is a hackathon prototype for digital risk protection. It manages official brand references, supports manual social profile analysis, and can search Apple App Store listings for possible impersonating apps.

## Project Status

Implemented:

- React 19 and Vite dashboard with sidebar navigation and responsive layout.
- Brand Profile management for company information, official social accounts, and official mobile applications.
- Express and Mongoose backend with MongoDB-backed Brand CRUD endpoints.
- Multiple official-domain references and manual candidate-domain analysis with explainable similarity signals.
- Deterministic social username analysis with manual or saved-brand references.
- On-demand Apple App Store Search API queries, official-app exclusion, candidate review leads, and persisted scan history.
- Experimental URL-phishing baseline trained with Python and scikit-learn from the supplied CSV.
- Request validation, URL and duplicate checks, API loading/error states, and backend validation tests.

Not implemented:

- Website fetching/content comparison, automated domain discovery, or ML integration with the Express API.
- Social network integrations or background/scheduled monitoring. Social profile analysis is manual.
- Google Play monitoring, app-logo comparison, automated app-store polling, or threat takedown workflows.
- Authentication, authorization, tenant isolation, or per-user access control. The current API is a development prototype and must not be exposed publicly without those controls.
- A verified-asset workflow. Saved accounts and apps are user-entered references, not independently verified identities.

## Requirements

- Node.js 20.19 or newer (Node 24.21.0 was used during development).
- npm.
- A MongoDB Atlas cluster and database user for running the backend.

## Project Structure

```text
backend/
  config/db.js             MongoDB connection helper
  models/Brand.js          Mongoose Brand schema
  models/AppStoreScan.js   Persisted Apple App Store scan and findings
  routes/brands.js         Brand CRUD API and request validation
  routes/appStore.js       Apple scan and scan-history API
  services/domainDetectionService.js     Hostname normalization and similarity
  services/appStoreMonitoringService.js  Apple lookup and candidate scoring
  services/socialDetectionService.js     Social username heuristic
  services/domainDetectionService.js     Domain hostname similarity service
ml/website_detection/
  data/raw/your_dataset.csv              Local dataset (ignored by Git)
  feature_extraction.py                  Dataset validation and hostname grouping
  train.py                               Model training and held-out evaluation
  evaluate.py                            Repeatable evaluation
  predict.py                             Experimental feature-based inference
  requirements.txt                       Python ML dependencies
  README.md                              ML setup, assumptions, and limitations
  test/brands.test.js      Database-independent API tests
  test/appStoreMonitoring.test.js  Apple response/scoring tests
  test/domainDetection.test.js  Domain normalization/scoring tests
  server.js                Express app and startup sequence
  .env.example             Safe environment-variable template
frontend/
  src/App.jsx              Dashboard and navigation
  src/BrandProfilePage.jsx Brand Profile interface and API client
  src/WebsiteAnalysisPage.jsx Manual candidate-domain analysis UI
  src/App.css              Dashboard and profile styling
```

## Install Dependencies

From the project root, install each package separately:

```powershell
npm.cmd --prefix backend install
npm.cmd --prefix frontend install
```

## Configure MongoDB Atlas

1. Create an Atlas cluster and a database user with access to the application database.
2. Configure Atlas Network Access to allow connections from your development machine or deployment environment.
3. Copy the example environment file and edit the copy:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   ```

4. Set `MONGODB_URI` in `backend/.env` to your Atlas connection string. For example:

   ```dotenv
   MONGODB_URI=mongodb+srv://<db-user>:<db-password>@<cluster-host>/brandprotect?retryWrites=true&w=majority
   PORT=5000
   ```

Replace the placeholders with your actual Atlas values. URL-encode reserved characters in the username or password when required by the connection string. Keep `backend/.env` private; `.env` files are ignored by Git. Do not put database credentials in frontend environment variables or commit them.

The backend reads `backend/.env`. It connects to MongoDB before opening the HTTP port. If `MONGODB_URI` is missing or the connection fails, the backend prints a configuration/network hint and exits without starting the server.

## Run Locally

Start the backend in one terminal:

```powershell
npm.cmd --prefix backend run dev
```

Start the frontend in another terminal:

```powershell
npm.cmd --prefix frontend run dev
```

Vite prints the local frontend URL, usually `http://localhost:5173`. The backend defaults to `http://localhost:5000`.

The frontend API base URL defaults to `http://localhost:5000`. To use another backend URL, create `frontend/.env.local` with:

```dotenv
VITE_API_BASE_URL=http://localhost:5000
```

Restart Vite after changing frontend environment variables. Never put secrets in `VITE_*` variables; they are bundled into browser code.

## Brand Profile

The Brand Profile page loads profiles from `GET /api/brands`. Users can create, select, update, and delete profiles through the backend API. It supports:

- Brand name, website, industry, description, region, and logo URL.
- Multiple official domains used as comparison references. Existing `websiteUrl` remains supported as a fallback domain.
- Multiple official social accounts with platform, username, profile URL, and notes.
- Multiple official apps with platform, app name, package/bundle ID, store listing, publisher, and icon URL.
- Required-field and HTTP(S) URL validation, duplicate social-handle checks per platform, and duplicate package/bundle ID checks.
- Inline loading, empty, success, and request-error states. Failed requests are not saved locally and do not display success.

The UI normalizes usernames by trimming whitespace and a leading `@`. The backend repeats important validation before persistence. Neither the profile name nor matching an app name implies that an account or app has been verified.

## Website Domain Analysis

The Website & URL Analysis page accepts a candidate HTTP(S) URL and a saved brand profile. `POST /api/analyze/website` loads the brand's `officialDomains` from MongoDB and falls back to its existing `websiteUrl` when no explicit domains are registered. Client-supplied official-domain lists are ignored.

Analysis is limited to the parsed hostname: it uses Damerau-Levenshtein similarity, lookalike `0/o` and `1/l/i` comparisons, and a small set of added words. Exact official domains and their subdomains return `OFFICIAL_MATCH`. A different final domain label alone receives no risk points. Results include the full candidate hostname, official reference, individual signals, provisional score, review status, and limitations.

This vertical slice does not fetch candidate websites or inspect page content, DNS, certificates, logos, or registration data. It is manual analysis, not domain discovery. Similarity scores are heuristic and do not prove fraud.

## Apple App Store Review

The Mobile App Analysis page performs an **on-demand** search against Apple's public iTunes Search API. Choose a saved brand and a two-letter App Store country code (defaults to `US`), then request a scan. Search terms are the brand name and registered official app names. Up to five terms are queried, with up to 50 listings per term.

The scanner maps Apple's `trackName`, `bundleId`, `artistName`, `sellerName`, `description`, `artworkUrl512` (or `artworkUrl100`), and `trackViewUrl` fields. It deduplicates listings and excludes registered official apps when their bundle ID or App Store listing ID matches, or when both app name and publisher match exactly. Other listings are compared against the brand name and registered app names. Similar names, differing registered bundle IDs or publishers, and a brand-name mention in the description contribute to a deterministic review score. Findings are review leads, not proof of impersonation; no app is declared malicious or verified automatically.

Each completed search is stored in MongoDB with its source, country, query terms, listing counts, excluded official-match count, results, reasons, and timestamp. The page can display the 20 most recent saved scans for a brand. No background schedule or continuous monitoring runs.

## API

All endpoints are served by the backend. Successful Brand API responses use `{ "status": "success", "data": ... }`; errors use `{ "status": "error", "error": { "code", "message", "details?" } }`.

### Health

```http
GET /api/health
```

Returns a simple API health response. The server only listens after MongoDB connects successfully.

### Brands

| Method | Endpoint | Purpose | Success status |
| --- | --- | --- | --- |
| `GET` | `/api/brands` | List brands, most recently updated first | `200` |
| `GET` | `/api/brands/:id` | Retrieve one brand | `200` |
| `POST` | `/api/brands` | Create a brand | `201` |
| `PUT` | `/api/brands/:id` | Replace the brand profile fields | `200` |
| `DELETE` | `/api/brands/:id` | Delete a brand | `200` |

Example create/update body:

```json
{
  "brandName": "Example Company",
  "websiteUrl": "https://example.com",
  "officialDomains": ["example.com", "example.co.uk"],
  "industry": "Technology",
  "description": "Example brand description",
  "region": "India",
  "logoUrl": "https://example.com/logo.png",
  "socialAccounts": [
    {
      "platform": "Instagram",
      "username": "example",
      "profileUrl": "https://www.instagram.com/example/",
      "notes": "Official account listed by the organization"
    }
  ],
  "officialApps": [
    {
      "appName": "Example App",
      "platform": "Android",
      "packageId": "com.example.app",
      "storeUrl": "https://play.google.com/store/apps/details?id=com.example.app",
      "publisher": "Example Company",
      "iconUrl": "https://example.com/app-icon.png"
    }
  ]
}
```

`brandName` is required. `officialDomains` is an optional array of public hostnames. Domain entries are normalized to lowercase ASCII hostnames and duplicates are rejected. Social account usernames and app names are required when their entries are included. Optional URLs must be valid `http` or `https` URLs. Supported social platforms are Instagram, Facebook, X, LinkedIn, YouTube, and Other. Supported app platforms are Android, iOS, and Other. A `PUT` request sends the complete profile body; omitted optional fields and arrays are reset to their defaults.

Common error statuses:

- `400`: validation error, malformed JSON, or invalid MongoDB ID.
- `404`: well-formed ID with no matching brand.
- `500`: database or internal operation failure. Internal stack traces and connection credentials are not returned.

### Profile Analyzer

```http
POST /api/analyze/profile
Content-Type: application/json
```

Example request:

```json
{
  "officialUsername": "example",
  "suspiciousUsername": "example_support",
  "paymentRequested": false
}
```

This endpoint provides a basic preliminary heuristic response. It is not proof of impersonation and does not call external platforms.

### Website Domain Analysis

```http
POST /api/analyze/website
Content-Type: application/json

{ "brandId": "BRAND_ID", "candidateUrl": "https://example-support.com/login" }
```

The backend loads official references from the saved brand record and returns `{ status: "success", data: { assessment, brandId, brandName, source, analyzedAt } }`. It returns `400` for invalid input or IDs, `404` when the brand does not exist, `422` when no official domain reference is available, and `503` when the database is unavailable. This endpoint does not perform network requests to the candidate URL.

## URL ML Baseline

The separate `ml/website_detection/` workspace contains an experimental class-weighted Logistic Regression baseline trained on the supplied URL-feature CSV. It is a general URL-phishing classifier, not a brand-impersonation model, and is **not connected to the Express website-analysis endpoint**.

Create the project-local environment and install dependencies:

```powershell
py -3 -m venv ml/website_detection/.venv
ml/website_detection/.venv/Scripts/python.exe -m pip install -r ml/website_detection/requirements.txt
```

Validate and train/evaluate:

```powershell
ml/website_detection/.venv/Scripts/python.exe ml/website_detection/prepare_dataset.py
ml/website_detection/.venv/Scripts/python.exe ml/website_detection/train.py --positive-label 1
ml/website_detection/.venv/Scripts/python.exe ml/website_detection/evaluate.py
ml/website_detection/.venv/Scripts/python.exe -m unittest discover -s ml/website_detection -p "test_*.py"
```

The supplied [Kaggle URL phishing dataset](https://www.kaggle.com/datasets/victusadi/phishing-urls-dataset-with-extracted-features) lists CC0: Public Domain and defines label `1` as phishing and `0` as benign. The CSV had 160,064 rows (label `0`: 820; label `1`: 159,244). A deterministic hostname-grouped holdout contained 32,013 rows (164 negative, 31,849 positive). The class-weighted Logistic Regression baseline reported precision `1.000`, recall `0.99997`, F1 `0.99998`, balanced accuracy `0.99998`, ROC AUC `1.000`, and confusion matrix `[[164, 0], [1, 31848]]`.

These unusually high results need investigation and are not evidence of real-world performance. The dataset card provides its source and license, but exact source snapshots and detailed feature-generation formulas are not included. The class distribution is highly imbalanced, and URL-phishing labels do not specifically represent brand impersonation. Scores are uncalibrated and are not probabilities of fraud. Artifacts, reports, `.venv`, and raw CSV files are Git-ignored.

### Apple App Store scans

| Method | Endpoint | Purpose | Success status |
| --- | --- | --- | --- |
| `POST` | `/api/brands/:brandId/app-store-scans` | Search Apple's App Store for a saved brand and persist the scan | `201` |
| `GET` | `/api/brands/:brandId/app-store-scans` | List the 20 most recent saved scans for a brand | `200` |

Start a scan with an optional two-letter storefront code:

```http
POST /api/brands/BRAND_ID/app-store-scans
Content-Type: application/json

{ "countryCode": "US" }
```

The default storefront is `US`. A successful scan includes `scannedAppCount`, `officialMatchCount`, `findings`, `queryTerms`, `source`, and `scannedAt`. A finding includes the App Store listing fields, similarity score, risk level, `NEEDS_REVIEW` status, and reasons.

Common scan errors are `400` for invalid IDs or country codes, `404` for a missing brand, `502` when Apple Search is unavailable, and `503` when MongoDB cannot store or retrieve scans. Failed searches are not saved as empty results.

## Data Model

The Mongoose `Brand` model contains:

- `brandName` (required), `websiteUrl`, `industry`, `description`, `region`, and `logoUrl`.
- `socialAccounts[]`: `platform`, `username` (required), `profileUrl`, and `notes`.
- `officialApps[]`: `appName` (required), `platform`, `packageId`, `storeUrl`, `publisher`, and `iconUrl`.
- `officialDomains[]`: normalized public hostnames used for manual website comparison.
- Mongoose-generated document/subdocument IDs and `createdAt` / `updatedAt` timestamps.

Optional strings default to empty strings and both arrays default to empty arrays. URL schema validation accepts only HTTP(S) URLs. The schema deliberately has no verification status; entered official references remain distinct from independently verified assets.

## Tests and Quality Checks

Run backend tests (they do not require an Atlas connection):

```powershell
npm.cmd --prefix backend test
```

Run frontend lint and production build:

```powershell
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
```

The backend tests exercise the health route, brand validation, social detection, Apple response mapping, official-app exclusion, candidate scoring, domain normalization/scoring, and scan-route validation. Service tests use deterministic fixtures and do not depend on Apple's availability. A live app scan requires MongoDB and the Apple Search API to be reachable.

The Python preprocessing suite checks schema validation, duplicate handling, hostname grouping, and conflicting labels. The ML metrics above are from the supplied local dataset and one hostname-grouped holdout fold, not an independent benchmark.

## Current Limitations

- MongoDB Atlas credentials and a live connection are environment-specific and are not included in this repository.
- No authentication or authorization is implemented; do not expose the API to untrusted networks.
- Dashboard statistics and threat reports are demo data. Social analysis is manual and heuristic; there are no social platform APIs.
- Website analysis accepts manual candidates only. It does not fetch pages or discover domains; safe content fetching, ML-to-API integration, and automated discovery remain future work.
- App Store review currently covers Apple only, on demand. Google Play, background scans, logo similarity, and automated verification are not implemented.
- App findings require human review and may include legitimate apps with similar names or publishers.
- The URL model may have dataset-specific leakage or bias and does not establish brand-specific impersonation. Validate feature extraction and metrics on additional representative datasets before operational use.