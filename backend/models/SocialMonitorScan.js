const mongoose = require('mongoose');

const findingSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  platform: { type: String, required: true, trim: true },
  profileUrl: { type: String, default: '', trim: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
  status: { type: String, enum: ['NEEDS_REVIEW', 'OFFICIAL_MATCH'], default: 'NEEDS_REVIEW' },
  reasons: { type: [String], default: [] },
  limitations: { type: [String], default: [] },
  matchedReference: { type: String, default: '', trim: true },
}, { _id: true });

const platformBreakdownSchema = new mongoose.Schema({
  platform: { type: String, required: true },
  scannedCount: { type: Number, default: 0 },
  findingCount: { type: Number, default: 0 },
  officialMatchCount: { type: Number, default: 0 },
}, { _id: false });

const socialMonitorScanSchema = new mongoose.Schema({
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
  source: { type: String, required: true, default: 'Social Platform Monitor (Simulated)' },
  platforms: { type: [String], default: [] },
  totalScanned: { type: Number, min: 0, default: 0 },
  officialMatchCount: { type: Number, min: 0, default: 0 },
  findings: { type: [findingSchema], default: [] },
  platformBreakdown: { type: [platformBreakdownSchema], default: [] },
  scannedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

socialMonitorScanSchema.index({ brandId: 1, scannedAt: -1 });

module.exports = mongoose.model('SocialMonitorScan', socialMonitorScanSchema);
