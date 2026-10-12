const mongoose = require('mongoose');

const findingSchema = new mongoose.Schema({
  trackId: { type: String, default: '', trim: true },
  appName: { type: String, required: true, trim: true },
  bundleId: { type: String, default: '', trim: true },
  publisher: { type: String, default: '', trim: true },
  sellerName: { type: String, default: '', trim: true },
  description: { type: String, default: '' },
  iconUrl: { type: String, default: '', trim: true },
  storeUrl: { type: String, default: '', trim: true },
  matchedSearchTerms: { type: [String], default: [] },
  matchedReferenceName: { type: String, default: '', trim: true },
  nameSimilarity: { type: Number, min: 0, max: 100, default: 0 },
  score: { type: Number, min: 0, max: 100, required: true },
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
  status: { type: String, enum: ['NEEDS_REVIEW'], default: 'NEEDS_REVIEW' },
  reasons: { type: [String], default: [] },
  logoSimilarity: { type: Number, min: 0, max: 100, default: null },
}, { _id: true });

const appStoreScanSchema = new mongoose.Schema({
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
  source: { type: String, required: true, default: 'Apple App Store Search API' },
  countryCode: { type: String, required: true, minlength: 2, maxlength: 2, uppercase: true },
  queryTerms: { type: [String], default: [] },
  scannedAppCount: { type: Number, min: 0, default: 0 },
  officialMatchCount: { type: Number, min: 0, default: 0 },
  findings: { type: [findingSchema], default: [] },
  scannedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

appStoreScanSchema.index({ brandId: 1, scannedAt: -1 });

module.exports = mongoose.model('AppStoreScan', appStoreScanSchema);