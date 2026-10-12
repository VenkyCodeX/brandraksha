const express = require('express');
const mongoose = require('mongoose');
const Brand = require('../models/Brand');
const SocialScan = require('../models/SocialScan');
const { normalizePlatform, normalizeUsername } = require('../services/socialDetectionService');
const { scanCandidates } = require('../services/socialCandidateScanService');
const { SOCIAL_PROVIDERS } = require('../services/socialProviders');

const router = express.Router();
const MAX_CANDIDATES = 50;
const MAX_PROVIDER_LOOKUPS = 10;
const SUPPORTED_SIGNALS = ['paymentRequested', 'credentialRequested'];

function validationError(res, message) {
  return res.status(400).json({
    ok: false,
    error: { code: 'VALIDATION_ERROR', message },
  });
}

function extractUsernameFromUrl(platform, profileUrl) {
  let url;
  try {
    url = new URL(profileUrl);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return '';

  const segments = url.pathname.split('/').filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return '';
    }
  });
  if (platform === 'LinkedIn' && ['in', 'company', 'school', 'showcase'].includes(segments[0]?.toLowerCase())) {
    return segments[1] || '';
  }
  if (platform === 'YouTube' && ['channel', 'c', 'user'].includes(segments[0]?.toLowerCase())) {
    return segments[1] || '';
  }
  if (platform === 'Facebook' && segments[0]?.toLowerCase() === 'profile.php') return '';
  return segments[0] || '';
}

function validateCandidates(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CANDIDATES) {
    return { error: `candidates must contain between 1 and ${MAX_CANDIDATES} entries.` };
  }

  const seen = new Set();
  const candidates = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: `candidates[${index}] must be an object.` };
    }
    const platform = normalizePlatform(item.platform);
    if (!platform) return { error: `candidates[${index}].platform must be a supported social platform.` };
    if (item.username !== undefined && typeof item.username !== 'string') {
      return { error: `candidates[${index}].username must be a string.` };
    }
    if (item.profileUrl !== undefined && typeof item.profileUrl !== 'string') {
      return { error: `candidates[${index}].profileUrl must be a string.` };
    }
    let profileUrl = (item.profileUrl || '').trim();
    if (profileUrl) {
      try {
        const url = new URL(profileUrl);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('Invalid URL');
        url.search = '';
        url.hash = '';
        profileUrl = url.toString();
      } catch {
        return { error: `candidates[${index}].profileUrl must be a valid http or https URL.` };
      }
    }

    const username = typeof item.username === 'string' && item.username.trim()
      ? item.username.trim().replace(/^@+/, '')
      : extractUsernameFromUrl(platform, profileUrl).replace(/^@+/, '');
    if (!username) return { error: `candidates[${index}] must include a username or a profile URL with an identifiable username.` };
    if (username.length > 100) return { error: `candidates[${index}].username must be at most 100 characters.` };

    const key = `${platform}:${normalizeUsername(username)}`;
    if (seen.has(key)) return { error: `candidates contains a duplicate ${platform} username.` };
    seen.add(key);
    candidates.push({ platform, username, profileUrl });
  }
  return { candidates };
}

function validateManualBrand(body) {
  const brandName = typeof body.brandName === 'string' ? body.brandName.trim() : '';
  if (!brandName || brandName.length > 200) return { error: 'brandName is required and must be at most 200 characters when brandId is not supplied.' };

  const officialAccounts = body.officialAccounts === undefined ? [] : body.officialAccounts;
  if (!Array.isArray(officialAccounts) || officialAccounts.length > 100) {
    return { error: 'officialAccounts must be an array of at most 100 entries.' };
  }
  const normalizedAccounts = [];
  for (const [index, account] of officialAccounts.entries()) {
    const platform = normalizePlatform(account?.platform);
    if (!account || typeof account !== 'object' || Array.isArray(account) || !platform || typeof account.username !== 'string' || !account.username.trim() || account.username.length > 100) {
      return { error: `officialAccounts[${index}] must include a supported platform and username.` };
    }
    normalizedAccounts.push({ platform, username: account.username.trim().replace(/^@+/, '') });
  }
  return { brand: { brandName, socialAccounts: normalizedAccounts }, brandId: null };
}

function validateReportedSignals(value) {
  if (value === undefined) return { reportedSignals: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'reportedSignals must be an object.' };
  for (const [signal, enabled] of Object.entries(value)) {
    if (!SUPPORTED_SIGNALS.includes(signal) || typeof enabled !== 'boolean') {
      return { error: `reportedSignals.${signal} must be a boolean supported signal.` };
    }
  }
  return { reportedSignals: value };
}

function validateProviders(value) {
  if (value === undefined) return { providers: [] };
  if (!Array.isArray(value) || value.length > Object.keys(SOCIAL_PROVIDERS).length) {
    return { error: 'providers must be an array of supported provider IDs.' };
  }
  const providers = [];
  for (const provider of value) {
    if (typeof provider !== 'string' || !Object.hasOwn(SOCIAL_PROVIDERS, provider)) {
      return { error: 'providers contains an unsupported provider ID.' };
    }
    if (providers.includes(provider)) return { error: 'providers must not contain duplicates.' };
    providers.push(provider);
  }
  return { providers };
}

function scanFindingForStorage(finding) {
  return {
    candidate: finding.candidate,
    source: finding.source,
    analysis: {
      normalizedUsername: finding.analysis.normalizedUsername,
      riskScore: finding.analysis.riskScore,
      riskLevel: finding.analysis.riskLevel,
      status: finding.analysis.status,
      reasons: finding.analysis.reasons,
      evidence: finding.analysis.evidence,
    },
    providerResults: finding.providerResults.map((result) => ({
      provider: result.provider,
      status: result.status,
      source: result.source,
      message: result.message,
      profile: result.profile ? {
        platform: result.profile.platform,
        username: result.profile.username,
        profileUrl: result.profile.profileUrl,
      } : undefined,
    })),
  };
}

router.post('/scan-candidates', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return validationError(res, 'Request body must be a JSON object.');
  }

  const candidateResult = validateCandidates(body.candidates);
  if (candidateResult.error) return validationError(res, candidateResult.error);
  const providerResult = validateProviders(body.providers);
  if (providerResult.error) return validationError(res, providerResult.error);
  if (providerResult.providers.length && candidateResult.candidates.length > MAX_PROVIDER_LOOKUPS) {
    return validationError(res, `Provider lookups are limited to ${MAX_PROVIDER_LOOKUPS} candidates per request.`);
  }
  const signalResult = validateReportedSignals(body.reportedSignals);
  if (signalResult.error) return validationError(res, signalResult.error);

  let brand;
  let brandId = null;
  if (body.brandId !== undefined) {
    if (typeof body.brandId !== 'string' || !mongoose.isObjectIdOrHexString(body.brandId)) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_ID', message: 'The brand ID is invalid.' } });
    }
    try {
      brand = await Brand.findById(body.brandId);
      if (!brand) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Brand profile not found.' } });
      brandId = brand._id || body.brandId;
    } catch (error) {
      console.error(`[social-scan] brand lookup failed (${error.name || 'Error'}).`);
      return res.status(503).json({ ok: false, error: { code: 'DATABASE_ERROR', message: 'Saved brand profiles are temporarily unavailable.' } });
    }
  } else {
    const manualBrand = validateManualBrand(body);
    if (manualBrand.error) return validationError(res, manualBrand.error);
    brand = manualBrand.brand;
  }

  try {
    const result = await scanCandidates({
      brand,
      candidates: candidateResult.candidates,
      providers: providerResult.providers,
      reportedSignals: signalResult.reportedSignals,
    });
    const scannedAt = new Date();
    const response = {
      ok: true,
      brand: { id: brandId ? String(brandId) : null, name: brand.brandName },
      scannedAt: scannedAt.toISOString(),
      providersRequested: providerResult.providers,
      ...result,
      persistence: { status: 'NOT_AVAILABLE', message: 'MongoDB scan history requires a saved brand profile and an active database connection.' },
    };

    if (brandId && mongoose.connection.readyState === 1) {
      try {
        const savedScan = await SocialScan.create({
          brandId,
          source: result.source,
          scannedAt,
          scanStatus: result.scanStatus,
          candidateCount: result.candidateCount,
          findings: result.findings.map(scanFindingForStorage),
          providerErrors: result.providerErrors,
        });
        response.scanId = String(savedScan._id);
        response.persistence = { status: 'SAVED' };
      } catch (error) {
        console.error(`[social-scan] history save failed (${error.name || 'Error'}).`);
        response.persistence = { status: 'FAILED', message: 'The scan completed but its history could not be saved.' };
      }
    }
    return res.json(response);
  } catch (error) {
    console.error(`[social-scan] analysis failed (${error.name || 'Error'}).`);
    return res.status(400).json({ ok: false, error: { code: 'ANALYSIS_ERROR', message: 'Candidate analysis could not be completed. Check submitted profile data.' } });
  }
});

module.exports = router;