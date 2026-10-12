const mongoose = require('mongoose');

const socialScanSchema = new mongoose.Schema({
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  brandName: { type: String, required: true, trim: true },
  platform: { type: String, default: '', trim: true },
  candidateUsername: { type: String, required: true, trim: true },
  officialReference: { type: String, default: '', trim: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
  status: { type: String, enum: ['OFFICIAL_MATCH', 'NEEDS_REVIEW'], required: true },
  reasons: { type: [String], default: [] },
  limitations: { type: [String], default: [] },
  paymentRequested: { type: Boolean, default: false },
  credentialRequested: { type: Boolean, default: false },
  analyzedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

socialScanSchema.index({ brandId: 1, analyzedAt: -1 });

module.exports = mongoose.model('SocialScan', socialScanSchema);
