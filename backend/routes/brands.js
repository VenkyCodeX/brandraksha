const express = require('express');
const mongoose = require('mongoose');
const Brand = require('../models/Brand');
const { normalizeOfficialDomain } = require('../services/domainDetectionService');

const router = express.Router();
const SOCIAL_PLATFORMS = ['Instagram', 'Facebook', 'X', 'LinkedIn', 'YouTube', 'Other'];
const APP_PLATFORMS = ['Android', 'iOS', 'Other'];
const STRING_FIELDS = ['brandName', 'websiteUrl', 'industry', 'description', 'region', 'logoUrl'];

function isOptionalHttpUrl(value) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validateBrandPayload(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object.'] };
  }

  const payload = {};
  for (const field of STRING_FIELDS) {
    const value = body[field];
    if (value !== undefined && typeof value !== 'string') {
      errors.push(`${field} must be a string.`);
      continue;
    }
    payload[field] = typeof value === 'string' ? value.trim() : '';
  }

  if (!payload.brandName) errors.push('brandName is required.');
  for (const field of ['websiteUrl', 'logoUrl']) {
    if (!isOptionalHttpUrl(payload[field])) errors.push(`${field} must be a valid http or https URL.`);
  }

  if (body.officialDomains !== undefined && !Array.isArray(body.officialDomains)) {
    errors.push('officialDomains must be an array.');
  }
  const officialDomains = Array.isArray(body.officialDomains) ? body.officialDomains : [];
  const normalizedDomains = [];
  for (const [index, domain] of officialDomains.entries()) {
    if (typeof domain !== 'string') {
      errors.push(`officialDomains[${index}] must be a string.`);
      continue;
    }
    try {
      normalizedDomains.push(normalizeOfficialDomain(domain));
    } catch (error) {
      errors.push(`officialDomains[${index}] is invalid: ${error.message}`);
    }
  }
  if (new Set(normalizedDomains).size !== normalizedDomains.length) {
    errors.push('officialDomains cannot contain duplicates after normalization.');
  }
  payload.officialDomains = [...new Set(normalizedDomains)];

  if (body.socialAccounts !== undefined && !Array.isArray(body.socialAccounts)) {
    errors.push('socialAccounts must be an array.');
  }
  if (body.officialApps !== undefined && !Array.isArray(body.officialApps)) {
    errors.push('officialApps must be an array.');
  }

  const socialAccounts = Array.isArray(body.socialAccounts) ? body.socialAccounts : [];
  const accountKeys = new Set();
  payload.socialAccounts = socialAccounts.map((account, index) => {
    if (!account || typeof account !== 'object' || Array.isArray(account)) {
      errors.push(`socialAccounts[${index}] must be an object.`);
      return {};
    }

    const platform = typeof account.platform === 'string' ? account.platform.trim() : 'Other';
    const username = typeof account.username === 'string' ? account.username.trim().replace(/^@/, '').trim() : '';
    const profileUrl = typeof account.profileUrl === 'string' ? account.profileUrl.trim() : '';
    const notes = typeof account.notes === 'string' ? account.notes.trim() : '';
    if (!SOCIAL_PLATFORMS.includes(platform)) errors.push(`socialAccounts[${index}].platform is invalid.`);
    if (account.platform !== undefined && typeof account.platform !== 'string') errors.push(`socialAccounts[${index}].platform must be a string.`);
    if (account.username !== undefined && typeof account.username !== 'string') errors.push(`socialAccounts[${index}].username must be a string.`);
    if (!username) errors.push(`socialAccounts[${index}].username is required.`);
    if (!isOptionalHttpUrl(profileUrl)) errors.push(`socialAccounts[${index}].profileUrl must be a valid http or https URL.`);
    if (account.profileUrl !== undefined && typeof account.profileUrl !== 'string') errors.push(`socialAccounts[${index}].profileUrl must be a string.`);
    if (account.notes !== undefined && typeof account.notes !== 'string') errors.push(`socialAccounts[${index}].notes must be a string.`);

    const accountKey = `${platform.toLowerCase()}:${username.toLowerCase()}`;
    if (username && accountKeys.has(accountKey)) errors.push(`Duplicate social account for ${platform}: ${username}.`);
    accountKeys.add(accountKey);
    return { platform, username, profileUrl, notes };
  });

  const officialApps = Array.isArray(body.officialApps) ? body.officialApps : [];
  const packageIds = new Set();
  payload.officialApps = officialApps.map((app, index) => {
    if (!app || typeof app !== 'object' || Array.isArray(app)) {
      errors.push(`officialApps[${index}] must be an object.`);
      return {};
    }

    const appName = typeof app.appName === 'string' ? app.appName.trim() : '';
    const platform = typeof app.platform === 'string' ? app.platform.trim() : 'Other';
    const packageId = typeof app.packageId === 'string' ? app.packageId.trim() : '';
    const storeUrl = typeof app.storeUrl === 'string' ? app.storeUrl.trim() : '';
    const publisher = typeof app.publisher === 'string' ? app.publisher.trim() : '';
    const iconUrl = typeof app.iconUrl === 'string' ? app.iconUrl.trim() : '';
    if (!appName) errors.push(`officialApps[${index}].appName is required.`);
    if (!APP_PLATFORMS.includes(platform)) errors.push(`officialApps[${index}].platform is invalid.`);
    if (app.platform !== undefined && typeof app.platform !== 'string') errors.push(`officialApps[${index}].platform must be a string.`);
    if (app.appName !== undefined && typeof app.appName !== 'string') errors.push(`officialApps[${index}].appName must be a string.`);
    for (const field of ['packageId', 'storeUrl', 'publisher', 'iconUrl']) {
      if (app[field] !== undefined && typeof app[field] !== 'string') {
        errors.push(`officialApps[${index}].${field} must be a string.`);
      }
    }
    if (!isOptionalHttpUrl(storeUrl)) errors.push(`officialApps[${index}].storeUrl must be a valid http or https URL.`);
    if (!isOptionalHttpUrl(iconUrl)) errors.push(`officialApps[${index}].iconUrl must be a valid http or https URL.`);
    const packageKey = packageId.toLowerCase();
    if (packageKey && packageIds.has(packageKey)) errors.push(`Duplicate package or bundle ID: ${packageId}.`);
    if (packageKey) packageIds.add(packageKey);
    return { appName, platform, packageId, storeUrl, publisher, iconUrl };
  });

  return { payload, errors };
}

function sendValidationError(res, errors) {
  return res.status(400).json({
    status: 'error',
    error: { code: 'VALIDATION_ERROR', message: 'Brand profile validation failed.', details: errors },
  });
}

function sendOperationError(res, operation, error) {
  console.error(`[brands] ${operation} failed (${error.name || 'Error'}).`);
  return res.status(500).json({
    status: 'error',
    error: { code: 'DATABASE_ERROR', message: `Unable to ${operation} brand profile right now.` },
  });
}

function validateId(req, res, next) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'INVALID_ID', message: 'The brand ID is invalid.' },
    });
  }
  return next();
}

router.get('/', async (req, res) => {
  try {
    const brands = await Brand.find().sort({ updatedAt: -1 });
    return res.json({ status: 'success', data: { brands } });
  } catch (error) {
    return sendOperationError(res, 'load', error);
  }
});

router.get('/:id', validateId, async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: 'Brand profile not found.' } });
    }
    return res.json({ status: 'success', data: { brand } });
  } catch (error) {
    return sendOperationError(res, 'load', error);
  }
});

router.post('/', async (req, res) => {
  const { payload, errors } = validateBrandPayload(req.body);
  if (errors.length) return sendValidationError(res, errors);

  try {
    const brand = await Brand.create(payload);
    return res.status(201).json({ status: 'success', data: { brand } });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return sendValidationError(res, Object.values(error.errors).map((item) => item.message));
    }
    return sendOperationError(res, 'create', error);
  }
});

router.put('/:id', validateId, async (req, res) => {
  const { payload, errors } = validateBrandPayload(req.body);
  if (errors.length) return sendValidationError(res, errors);

  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: 'Brand profile not found.' } });
    }
    brand.set(payload);
    await brand.save();
    return res.json({ status: 'success', data: { brand } });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return sendValidationError(res, Object.values(error.errors).map((item) => item.message));
    }
    return sendOperationError(res, 'update', error);
  }
});

router.delete('/:id', validateId, async (req, res) => {
  try {
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) {
      return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: 'Brand profile not found.' } });
    }
    return res.json({ status: 'success', data: { id: brand._id } });
  } catch (error) {
    return sendOperationError(res, 'delete', error);
  }
});

module.exports = router;