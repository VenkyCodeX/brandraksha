# BrandProtect AI — Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (React 19 + Vite)                    │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Brand Profile│  │ Social Threat     │  │ Mobile App Analysis  │  │
│  │ Page         │  │ Analysis Page     │  │ Page                 │  │
│  │              │  │                  │  │                      │  │
│  │ CRUD brand   │  │ Manual candidate │  │ On-demand Apple      │  │
│  │ profiles,    │  │ username input   │  │ App Store search,    │  │
│  │ social       │  │ vs official      │  │ scan history,        │  │
│  │ accounts,    │  │ reference or     │  │ finding review       │  │
│  │ official     │  │ saved brand      │  │                      │  │
│  │ apps,        │  │                  │  │                      │  │
│  │ domains      │  │                  │  │                      │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│         │                   │                        │              │
│  ┌──────┴───────────────────┴────────────────────────┴───────────┐  │
│  │                  Website & URL Analysis Page                  │  │
│  │         Manual candidate URL vs saved brand domains           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP/JSON (fetch)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Express API  (Node.js 20+)                       │
│                                                                     │
│  GET  /api/health          — liveness check                         │
│  GET  /api/stats           — live counts from MongoDB               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Brand CRUD  (/api/brands)                                  │    │
│  │  POST / GET / PUT / DELETE                                  │    │
│  │  • Request validation (types, URLs, duplicates)             │    │
│  │  • Domain normalization via domainDetectionService          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Social Analysis  (POST /api/analyze/profile)               │    │
│  │  socialDetectionService                                     │    │
│  │  • Levenshtein similarity                                   │    │
│  │  • Lookalike character detection  (0↔o, 1↔l/i)             │    │
│  │  • Role-word detection  (support, help, verify…)            │    │
│  │  • Payment / credential flags                               │    │
│  │  • Official account → OFFICIAL_MATCH (score 0)             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Domain Analysis  (POST /api/analyze/website)               │    │
│  │  domainDetectionService                                     │    │
│  │  • Damerau-Levenshtein hostname similarity                  │    │
│  │  • Lookalike character detection                            │    │
│  │  • Added-word detection  (support, login, secure…)          │    │
│  │  • TLD-only difference → no risk points                     │    │
│  │  • Official domain / subdomain → OFFICIAL_MATCH             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  App Store Scan  (/api/brands/:id/app-store-scans)          │    │
│  │  appStoreMonitoringService                                  │    │
│  │  • POST → search Apple iTunes Search API (up to 5 terms,   │    │
│  │           50 results each), deduplicate, assess, persist    │    │
│  │  • GET  → return 20 most recent saved scans                 │    │
│  └──────────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────────┼───────────────────────────────────┘
                                  │
              ┌───────────────────┴────────────────────┐
              │                                        │
              ▼                                        ▼
┌─────────────────────────┐            ┌───────────────────────────┐
│   MongoDB Atlas          │            │  Apple iTunes Search API  │
│                          │            │  (public, read-only)      │
│  Brand collection        │            │                           │
│  • brandName             │            │  GET /search?term=…       │
│  • officialDomains[]     │            │  &entity=software         │
│  • socialAccounts[]      │            │  &country=US&limit=50     │
│  • officialApps[]        │            │                           │
│  • websiteUrl, logoUrl…  │            │  Returns: trackName,      │
│                          │            │  bundleId, artistName,    │
│  AppStoreScan collection │            │  sellerName, description, │
│  • brandId (ref)         │            │  artworkUrl, trackViewUrl │
│  • findings[]            │            └───────────────────────────┘
│  • scannedAt, country    │
└─────────────────────────┘
```

## Detection Logic Summary

### Social Username Analysis

| Signal | Points |
|---|---|
| Exact official username match | OFFICIAL_MATCH (score 0) |
| ≥ 95% similar to official username | +50 |
| ≥ 85% similar | +45 |
| ≥ 75% similar | +35 |
| ≥ 60% similar | +25 |
| ≥ 50% similar | +15 |
| Role word present (support, help, verify…) | reason added |
| Role word stripped → exact official match | similarity boosted to 90% |
| Lookalike character substitution (0/o, 1/l/i) | reason added |
| Payment request reported | +30 |
| Credential request reported | +40 |

Risk levels: LOW < 30 · MEDIUM 30–59 · HIGH 60–79 · CRITICAL ≥ 80

### Domain Hostname Analysis

| Signal | Points |
|---|---|
| Exact official domain or subdomain | OFFICIAL_MATCH (score 0) |
| TLD-only difference | 0 (not suspicious alone) |
| ≥ 95% Damerau-Levenshtein similarity | +45 |
| ≥ 85% similar | +35 |
| ≥ 75% similar | +25 |
| ≥ 65% similar | +15 |
| ≥ 55% similar | +10 |
| Added brand-related word (support, login, secure…) | +10 |

Risk levels: LOW < 30 · MEDIUM 30–54 · HIGH 55–74 · CRITICAL ≥ 75

### App Store Candidate Scoring

| Signal | Points |
|---|---|
| Bundle ID or track ID matches official app | OFFICIAL_MATCH (excluded) |
| Exact app name + publisher matches official app | OFFICIAL_MATCH (excluded) |
| App name ≥ 90% similar to brand/app reference | +40 |
| App name ≥ 75% similar | +30 |
| App name ≥ 60% similar | +20 |
| App name ≥ 45% similar | +10 |
| Similar name + different bundle ID from registered app | +25 |
| Similar name + different publisher from registered app | +20 |
| Description mentions brand name (name similarity ≥ 60%) | +10 |

Review threshold: score ≥ 20 · Risk levels: LOW < 30 · MEDIUM 30–59 · HIGH 60–79 · CRITICAL ≥ 80

## Data Flow: Official Asset Exclusion

```
Saved Brand Profile
        │
        ├── officialDomains[]  ──► Domain analysis: exact/subdomain → OFFICIAL_MATCH
        │
        ├── socialAccounts[]   ──► Social analysis: normalized exact match → OFFICIAL_MATCH
        │                          (per-platform filter when platform is specified)
        │
        └── officialApps[]     ──► App scan: bundle ID / track ID / name+publisher → excluded
                                   Remaining candidates scored against brand name + app names
```

## What Is Not Implemented

- Live social platform API integrations (Instagram, X, Facebook, LinkedIn, YouTube)
- Google Play Store monitoring
- Automated / scheduled background scanning
- Website content fetching, DNS, certificate, or WHOIS analysis
- Logo or image similarity comparison
- Authentication, authorization, or tenant isolation
- ML model integration with the Express API (model exists separately in `ml/`)
