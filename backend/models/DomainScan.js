const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true },
  points: { type: Number, required: true, default: 0 },
  detail: { type: String, required: true, trim: true },
}, { _id: false });

const domainScanSchema = new mongoose.Schema({
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
  brandName: { type: String, required: true, trim: true },
  candidateUrl: { type: String, required: true, trim: true },
  candidateHostname: { type: String, required: true, trim: true },
  officialDomain: { type: String, required: true, trim: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  riskLevel: { type: String, required: true, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
  status: { type: String, required: true, enum: ['OFFICIAL_MATCH', 'NEEDS_REVIEW'] },
  similarity: { type: Number, required: true, min: 0, max: 100 },
  signals: { type: [signalSchema], default: [] },
  reasons: { type: [String], default: [] },
  limitations: { type: [String], default: [] },
  analyzedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

domainScanSchema.index({ brandId: 1, analyzedAt: -1 });

module.exports = mongoose.model('DomainScan', domainScanSchema);
