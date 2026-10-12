
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const connectToDatabase = require("./config/db");
const Brand = require("./models/Brand");
<<<<<<< HEAD
const AppStoreScan = require("./models/AppStoreScan");
const SocialScan = require("./models/SocialScan");
const DomainScan = require("./models/DomainScan");
const SocialMonitorScan = require("./models/SocialMonitorScan");
const brandsRouter = require("./routes/brands");
const appStoreRouter = require("./routes/appStore");
const {
  SOCIAL_PLATFORMS,
  SocialDetectionInputError,
  analyzeSocialCandidate,
  normalizeUsername
} = require("./services/socialDetectionService");
const {
  DomainAnalysisInputError,
  analyzeCandidateDomain,
} = require("./services/domainDetectionService");
const { enrichSocialProfile } = require("./services/socialEnrichmentService");
=======
const brandsRouter = require("./routes/brands");
const socialRouter = require("./routes/social");
const logoRouter = require("./routes/logo");
const { analyzeSocialProfile, normalizePlatform } = require("./services/socialDetectionService");
>>>>>>> 0fdc5c7e1e07a369b137e1a80f999f73cbf0207e

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/brands", brandsRouter);
<<<<<<< HEAD
app.use("/api", appStoreRouter);

app.get("/api/scans/recent", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      status: "error",
      error: { code: "DATABASE_UNAVAILABLE", message: "Scan history is temporarily unavailable." }
    });
  }
  try {
    const limit = 20;
    const [socialRaw, domainRaw, appRaw, socialMonitorRaw] = await Promise.all([
      SocialScan.find({}, { brandName: 1, candidateUsername: 1, riskLevel: 1, status: 1, platform: 1, score: 1, analyzedAt: 1 }).sort({ analyzedAt: -1 }).limit(limit).lean(),
      DomainScan.find({}, { brandName: 1, candidateHostname: 1, riskLevel: 1, status: 1, score: 1, analyzedAt: 1 }).sort({ analyzedAt: -1 }).limit(limit).lean(),
      AppStoreScan.find({}, { brandId: 1, source: 1, scannedAt: 1, findings: 1, countryCode: 1 }).sort({ scannedAt: -1 }).limit(limit).lean(),
      SocialMonitorScan.find({}, { brandId: 1, source: 1, scannedAt: 1, findings: 1, platforms: 1 }).sort({ scannedAt: -1 }).limit(limit).lean(),
    ]);

    const social = socialRaw.map((s) => ({
      _id: String(s._id), type: 'social', brandName: s.brandName,
      target: s.candidateUsername, riskLevel: s.riskLevel, status: s.status,
      detail: s.platform || 'Social', score: s.score, at: s.analyzedAt,
    }));
    const domain = domainRaw.map((d) => ({
      _id: String(d._id), type: 'domain', brandName: d.brandName,
      target: d.candidateHostname, riskLevel: d.riskLevel, status: d.status,
      detail: 'Domain', score: d.score, at: d.analyzedAt,
    }));
    const app = appRaw.map((a) => ({
      _id: String(a._id), type: 'app', brandName: '',
      target: `${a.source} · ${a.countryCode}`, riskLevel: a.findings?.length ? a.findings[0].riskLevel : 'LOW',
      status: 'NEEDS_REVIEW', detail: 'App Store', score: null,
      findingCount: a.findings?.length || 0, at: a.scannedAt,
    }));
    const socialMonitor = socialMonitorRaw.map((m) => ({
      _id: String(m._id), type: 'social',  brandName: '',
      target: `Social Monitor · ${(m.platforms || []).join(', ')}`,
      riskLevel: m.findings?.length ? m.findings[0].riskLevel : 'LOW',
      status: 'NEEDS_REVIEW', detail: 'Platform Scan (Simulated)', score: null,
      findingCount: m.findings?.length || 0, at: m.scannedAt,
    }));

    const merged = [...social, ...domain, ...app, ...socialMonitor]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);

    return res.json({ status: "success", data: { scans: merged } });
  } catch (error) {
    console.error(`Recent scans failed (${error.name || "Error"}).`);
    return res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Recent scans could not be retrieved." }
    });
  }
});
=======
app.use("/api/social", socialRouter);
app.use("/api/analyze", logoRouter);
>>>>>>> 0fdc5c7e1e07a369b137e1a80f999f73cbf0207e

app.get("/api/health", (req, res) => {
  res.json({
    status: "success",
    message: "Digital Risk Protection API is running!"
  });
});

app.get("/api/stats", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      status: "error",
      error: { code: "DATABASE_UNAVAILABLE", message: "Stats are temporarily unavailable." }
    });
  }
  try {
    const [brands, appScans, socialScans, domainScans, socialMonitorScans] = await Promise.all([
      Brand.find({}, { socialAccounts: 1, officialApps: 1 }).lean(),
      AppStoreScan.countDocuments(),
      SocialScan.countDocuments(),
      DomainScan.countDocuments(),
      SocialMonitorScan.countDocuments(),
    ]);
    const totalSocialAccounts = brands.reduce((sum, b) => sum + (b.socialAccounts?.length || 0), 0);
    const totalOfficialApps = brands.reduce((sum, b) => sum + (b.officialApps?.length || 0), 0);
    return res.json({
      status: "success",
      data: {
        brandProfiles: brands.length,
        appStoreScans: appScans,
        socialScans: socialScans + socialMonitorScans,
        domainScans,
        officialSocialAccounts: totalSocialAccounts,
        officialApps: totalOfficialApps,
      }
    });
  } catch (error) {
    console.error(`Stats failed (${error.name || "Error"}).`);
    return res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Stats could not be retrieved." }
    });
  }
});

const PORT = process.env.PORT || 5000;


app.post("/api/analyze/profile", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
<<<<<<< HEAD
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "Request body must be a JSON object." }
=======
    return res.status(400).json({ status: "error", error: { code: "INVALID_INPUT", message: "Request body must be a JSON object." } });
  }

  const platformInput = body.platform === undefined ? "Other" : body.platform;
  const platform = normalizePlatform(platformInput);
  if (!platform) {
    return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: "platform must be a supported social platform." } });
  }
  if (typeof body.suspiciousUsername !== "string" || !body.suspiciousUsername.trim() || body.suspiciousUsername.length > 100) {
    return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: "suspiciousUsername is required and must be at most 100 characters." } });
  }

  let reportedSignals = {};
  if (body.reportedSignals !== undefined) {
    if (!body.reportedSignals || typeof body.reportedSignals !== "object" || Array.isArray(body.reportedSignals)) {
      return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: "reportedSignals must be an object." } });
    }
    reportedSignals = { ...body.reportedSignals };
  }
  for (const signal of ["paymentRequested", "credentialRequested"]) {
    if (body[signal] !== undefined) {
      if (typeof body[signal] !== "boolean") {
        return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: `${signal} must be a boolean.` } });
      }
      reportedSignals[signal] = body[signal];
    }
  }
  for (const [signal, value] of Object.entries(reportedSignals)) {
    if (!["paymentRequested", "credentialRequested"].includes(signal) || typeof value !== "boolean") {
      return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: `reportedSignals.${signal} must be a boolean supported signal.` } });
    }
  }

  let brandName;
  let officialAccounts;
  if (body.brandId !== undefined) {
    if (typeof body.brandId !== "string" || !mongoose.isObjectIdOrHexString(body.brandId)) {
      return res.status(400).json({ status: "error", error: { code: "INVALID_ID", message: "The brand ID is invalid." } });
    }
    try {
      const brand = await Brand.findById(body.brandId);
      if (!brand) {
        return res.status(404).json({ status: "error", error: { code: "NOT_FOUND", message: "Brand profile not found." } });
      }
      brandName = brand.brandName;
      officialAccounts = brand.socialAccounts.map((account) => ({
        platform: account.platform,
        username: account.username,
        profileUrl: account.profileUrl,
      }));
    } catch (error) {
      console.error(`[profile-analysis] brand lookup failed (${error.name || "Error"}).`);
      return res.status(503).json({ status: "error", error: { code: "DATABASE_ERROR", message: "Saved brand profiles are temporarily unavailable." } });
    }
  } else {
    brandName = typeof body.brandName === "string" ? body.brandName.trim() : "";
    officialAccounts = body.officialAccounts;
    if (officialAccounts === undefined && typeof body.officialUsername === "string" && body.officialUsername.trim()) {
      officialAccounts = [{ platform, username: body.officialUsername }];
      if (!brandName) brandName = body.officialUsername.trim().replace(/^@+/, "");
    }
    if (!brandName) {
      return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: "brandName is required when brandId is not supplied." } });
    }
    if (officialAccounts === undefined) officialAccounts = [];
    if (!Array.isArray(officialAccounts)) {
      return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: "officialAccounts must be an array." } });
    }
    for (const [index, account] of officialAccounts.entries()) {
      if (!account || typeof account !== "object" || Array.isArray(account) || !normalizePlatform(account.platform) || typeof account.username !== "string" || !account.username.trim() || account.username.length > 100) {
        return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: `officialAccounts[${index}] must include a supported platform and username.` } });
      }
    }
  }

  try {
    const analysis = analyzeSocialProfile({
      brandName,
      officialAccounts,
      platform,
      suspiciousUsername: body.suspiciousUsername,
      reportedSignals,
>>>>>>> 0fdc5c7e1e07a369b137e1a80f999f73cbf0207e
    });
    return res.json({
      ok: true,
      ...analysis,
      suspiciousUsername: analysis.candidate.username,
    });
  } catch (error) {
    return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: error.message } });
  }
<<<<<<< HEAD

  const candidateUsername = body.candidateUsername ?? body.suspiciousUsername;
  if (typeof candidateUsername !== "string" || !normalizeUsername(candidateUsername)) {
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "A candidate username is required." }
    });
  }
  if (candidateUsername.length > 128) {
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "Candidate username must be 128 characters or fewer." }
    });
  }
  if (body.officialUsername !== undefined && typeof body.officialUsername !== "string") {
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "Official username must be a string." }
    });
  }
  if (body.platform !== undefined && !SOCIAL_PLATFORMS.includes(body.platform)) {
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "Platform is invalid." }
    });
  }
  if (body.brandId !== undefined && typeof body.brandId !== "string") {
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "brandId must be a string." }
    });
  }
  const credentialRequested = body.credentialRequested ?? body.credentialsRequested;
  for (const [field, value] of Object.entries({ paymentRequested: body.paymentRequested, credentialRequested })) {
    if (value !== undefined && typeof value !== "boolean") {
      return res.status(400).json({
        status: "error",
        error: { code: "VALIDATION_ERROR", message: `${field} must be a boolean.` }
      });
    }
  }

  let officialUsernames = [];
  let officialUsername = body.officialUsername;
  if (body.brandId) {
    if (!mongoose.isObjectIdOrHexString(body.brandId)) {
      return res.status(400).json({
        status: "error",
        error: { code: "INVALID_ID", message: "The brand ID is invalid." }
      });
    }
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        status: "error",
        error: { code: "DATABASE_UNAVAILABLE", message: "Saved brand references are temporarily unavailable." }
      });
    }

    try {
      const brand = await Brand.findById(body.brandId);
      if (!brand) {
        return res.status(404).json({
          status: "error",
          error: { code: "BRAND_NOT_FOUND", message: "Saved brand profile not found." }
        });
      }
      officialUsernames = brand.socialAccounts
        .filter((account) => !body.platform || account.platform === body.platform)
        .map((account) => ({ username: account.username, platform: account.platform }));
      officialUsername = undefined;
    } catch (error) {
      return res.status(503).json({
        status: "error",
        error: { code: "DATABASE_UNAVAILABLE", message: "Saved brand references are temporarily unavailable." }
      });
    }
  }

  try {
    const assessment = analyzeSocialCandidate({
      officialUsername,
      officialUsernames,
      candidateUsername,
      paymentRequested: body.paymentRequested,
      credentialRequested,
    });

    // Best-effort profile enrichment for X/Twitter — non-blocking.
    const enrichment = await enrichSocialProfile(body.platform, candidateUsername).catch(() => null);

    return res.json({
      ...assessment,
      suspiciousUsername: candidateUsername,
      candidateUsername,
      riskScore: assessment.score,
      disclaimer: assessment.limitations[0],
      profileEnrichment: enrichment,
    });
  } catch (error) {
    if (error instanceof SocialDetectionInputError) {
      return res.status(400).json({
        status: "error",
        error: { code: "VALIDATION_ERROR", message: error.message, field: error.field }
      });
    }

    console.error(`Profile analysis failed (${error.name || "Error"}).`);
    return res.status(500).json({
      status: "error",
      error: { code: "ANALYSIS_ERROR", message: "Profile analysis could not be completed." }
    });
  }
});

app.post("/api/analyze/website", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "Request body must be a JSON object." }
    });
  }
  if (typeof body.brandId !== "string" || !body.brandId) {
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "A saved brandId is required." }
    });
  }
  if (!mongoose.isObjectIdOrHexString(body.brandId)) {
    return res.status(400).json({
      status: "error",
      error: { code: "INVALID_ID", message: "The brand ID is invalid." }
    });
  }
  if (typeof body.candidateUrl !== "string" || !body.candidateUrl.trim()) {
    return res.status(400).json({
      status: "error",
      error: { code: "VALIDATION_ERROR", message: "A candidate URL is required." }
    });
  }
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      status: "error",
      error: { code: "DATABASE_UNAVAILABLE", message: "Saved brand references are temporarily unavailable." }
    });
  }

  try {
    const brand = await Brand.findById(body.brandId);
    if (!brand) {
      return res.status(404).json({
        status: "error",
        error: { code: "BRAND_NOT_FOUND", message: "Saved brand profile not found." }
      });
    }

    const officialDomains = [...(brand.officialDomains || [])];
    if (brand.websiteUrl) {
      try {
        officialDomains.push(new URL(brand.websiteUrl).hostname);
      } catch {
        // The schema normally prevents this; retain explicit domains if legacy data is malformed.
      }
    }
    const assessment = analyzeCandidateDomain({ candidateUrl: body.candidateUrl, officialDomains, brandName: brand.brandName });
    return res.json({
      status: "success",
      data: {
        assessment,
        brandId: String(brand._id),
        brandName: brand.brandName,
        source: "manual_candidate_submission",
        analyzedAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    if (error instanceof DomainAnalysisInputError) {
      return res.status(error.field === "officialDomains" ? 422 : 400).json({
        status: "error",
        error: { code: error.field === "officialDomains" ? "NO_OFFICIAL_DOMAINS" : "VALIDATION_ERROR", message: error.message, field: error.field }
      });
    }

    console.error(`Website domain analysis failed (${error.name || "Error"}).`);
    return res.status(503).json({
      status: "error",
      error: { code: "ANALYSIS_UNAVAILABLE", message: "Website domain analysis could not be completed." }
    });
  }
=======
>>>>>>> 0fdc5c7e1e07a369b137e1a80f999f73cbf0207e
});


app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      status: "error",
      error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." }
    });
  }

  console.error("Request failed due to an internal server error.");
  return res.status(500).json({
    status: "error",
    error: { code: "INTERNAL_ERROR", message: "The request could not be completed." }
  });
});

async function startServer() {
  try {
    await connectToDatabase();
  } catch (error) {
    console.error("MongoDB connection failed. Verify backend/.env MONGODB_URI and Atlas network access.");
    console.error(`Connection error type: ${error.name || "Error"}`);
    process.exitCode = 1;
    return null;
  }

  return app.listen(PORT, () => {
    console.log(`Backend connected to MongoDB and listening on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
