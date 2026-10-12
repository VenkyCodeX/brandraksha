const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  signal: { type: String, required: true },
  description: { type: String, required: true },
  points: { type: Number, required: true, min: 0, max: 100 },
  category: { type: String, default: 'identity' },
}, { _id: false });

const providerProfileSchema = new mongoose.Schema({
  platform: { type: String, default: '' },
  username: { type: String, default: '' },
  displayName: { type: String, default: '' },
  profileUrl: { type: String, default: '' },
}, { _id: false });

const providerResultSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  status: { type: String, required: true },
  source: { type: String, default: null },
  message: { type: String, default: '' },
  profile: { type: providerProfileSchema, default: undefined },
}, { _id: false });

const findingSchema = new mongoose.Schema({
  candidate: {
    platform: { type: String, required: true },
    username: { type: String, required: true, maxlength: 100 },
    profileUrl: { type: String, default: '', maxlength: 500 },
  },
  source: { type: String, enum: ['MANUAL_INPUT'], required: true },
  analysis: {
    normalizedUsername: { type: String, required: true },
    riskScore: { type: Number, required: true, min: 0, max: 100 },
    riskLevel: { type: String, required: true },
    status: { type: String, required: true },
    reasons: { type: [String], default: [] },
    evidence: { type: [evidenceSchema], default: [] },
  },
  providerResults: { type: [providerResultSchema], default: [] },
}, { _id: false });

const providerErrorSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  status: { type: String, required: true },
  message: { type: String, required: true, maxlength: 300 },
}, { _id: false });

const socialScanSchema = new mongoose.Schema({
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
  source: { type: String, enum: ['MANUAL_INPUT'], required: true },
  scannedAt: { type: Date, default: Date.now, index: true },
  scanStatus: { type: String, required: true },
  candidateCount: { type: Number, required: true, min: 1 },
  findings: { type: [findingSchema], default: [] },
  providerErrors: { type: [providerErrorSchema], default: [] },
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('SocialScan', socialScanSchema);