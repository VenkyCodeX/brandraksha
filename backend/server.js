
const express = require("express");
const cors = require("cors");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const connectToDatabase = require("./config/db");
const brandsRouter = require("./routes/brands");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/brands", brandsRouter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "success",
    message: "Digital Risk Protection API is running!"
  });
});

const PORT = process.env.PORT || 5000;


app.post("/api/analyze/profile", (req, res) => {
  const { officialUsername, suspiciousUsername, paymentRequested } = req.body;

  if (
    typeof officialUsername !== "string" ||
    typeof suspiciousUsername !== "string" ||
    !officialUsername.trim() ||
    !suspiciousUsername.trim()
  ) {
    return res.status(400).json({
      error: "Both usernames are required"
    });
  }

  const official = officialUsername.trim().replace(/^@/, "").toLowerCase();
  const suspicious = suspiciousUsername.trim().replace(/^@/, "").toLowerCase();

  let riskScore = 0;
  const reasons = [];

  if (official === suspicious) {
    reasons.push("Usernames match exactly; identity is not verified");
  } else if (
    suspicious.includes(official) ||
    official.includes(suspicious)
  ) {
    riskScore += 30;
    reasons.push("Username resembles the official brand");
  }

  if (paymentRequested === true) {
    riskScore += 40;
    reasons.push("Payment request reported by the user");
  }

  riskScore = Math.min(riskScore, 100);

  res.json({
    suspiciousUsername,
    riskScore,
    riskLevel: riskScore >= 60 ? "HIGH" :
               riskScore >= 30 ? "MEDIUM" : "LOW",
    reasons,
    disclaimer: "Preliminary heuristic score, not proof of impersonation"
  });
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
