
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const connectToDatabase = require("./config/db");
const Brand = require("./models/Brand");
const brandsRouter = require("./routes/brands");
const socialRouter = require("./routes/social");
const logoRouter = require("./routes/logo");
const { analyzeSocialProfile, normalizePlatform } = require("./services/socialDetectionService");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/brands", brandsRouter);
app.use("/api/social", socialRouter);
app.use("/api/analyze", logoRouter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "success",
    message: "Digital Risk Protection API is running!"
  });
});

const PORT = process.env.PORT || 5000;


app.post("/api/analyze/profile", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
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
    });
    return res.json({
      ok: true,
      ...analysis,
      suspiciousUsername: analysis.candidate.username,
    });
  } catch (error) {
    return res.status(400).json({ status: "error", error: { code: "VALIDATION_ERROR", message: error.message } });
  }
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
