const mongoose = require('mongoose');
const { normalizeOfficialDomain } = require('../services/domainDetectionService');

const SOCIAL_PLATFORMS = ['Instagram', 'Facebook', 'X', 'LinkedIn', 'YouTube', 'Other'];
const APP_PLATFORMS = ['Android', 'iOS', 'Other'];

function isOptionalHttpUrl(value) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const socialAccountSchema = new mongoose.Schema({
  platform: { type: String, enum: SOCIAL_PLATFORMS, default: 'Other', trim: true },
  username: { type: String, required: true, trim: true },
  profileUrl: {
    type: String,
    default: '',
    trim: true,
    validate: { validator: isOptionalHttpUrl, message: 'Profile URL must use http or https.' },
  },
  notes: { type: String, default: '', trim: true },
});

const officialAppSchema = new mongoose.Schema({
  appName: { type: String, required: true, trim: true },
  platform: { type: String, enum: APP_PLATFORMS, default: 'Other', trim: true },
  packageId: { type: String, default: '', trim: true },
  storeUrl: {
    type: String,
    default: '',
    trim: true,
    validate: { validator: isOptionalHttpUrl, message: 'Store URL must use http or https.' },
  },
  publisher: { type: String, default: '', trim: true },
  iconUrl: {
    type: String,
    default: '',
    trim: true,
    validate: { validator: isOptionalHttpUrl, message: 'Icon URL must use http or https.' },
  },
});

const brandSchema = new mongoose.Schema({
  brandName: { type: String, required: true, trim: true },
  websiteUrl: {
    type: String,
    default: '',
    trim: true,
    validate: { validator: isOptionalHttpUrl, message: 'Website URL must use http or https.' },
  },
  officialDomains: {
    type: [{
      type: String,
      trim: true,
      validate: {
        validator(value) {
          try {
            return normalizeOfficialDomain(value) === value;
          } catch {
            return false;
          }
        },
        message: 'Official domains must be normalized public hostnames.',
      },
    }],
    default: [],
  },
  industry: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  region: { type: String, default: '', trim: true },
  logoUrl: {
    type: String,
    default: '',
    trim: true,
    validate: { validator: isOptionalHttpUrl, message: 'Logo URL must use http or https.' },
  },
  socialAccounts: { type: [socialAccountSchema], default: [] },
  officialApps: { type: [officialAppSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Brand', brandSchema);