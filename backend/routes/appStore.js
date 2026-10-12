const express = require('express');
const mongoose = require('mongoose');
const AppStoreScan = require('../models/AppStoreScan');
const DomainScan = require('../models/DomainScan');
const SocialScan = require('../models/SocialScan');
const Brand = require('../models/Brand');
const { AppStoreSearchError, searchAppleAppStore } = require('../services/appStoreMonitoringService');
const { searchGooglePlay } = require('../services/googlePlayService');
const { compareImageUrls } = require('../services/imageSimilarityService');
const { scanAllPlatforms } = require('../services/socialMonitoringService');
const SocialMonitorScan = require('../models/SocialMonitorScan');

const router = express.Router();

function validateBrandId(req, res, next) {
  if (!mongoose.isObjectIdOrHexString(req.params.brandId)) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'INVALID_ID', message: 'The brand ID is invalid.' },
    });
  }
  return next();
}

function ensureDatabase(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({
    status: 'error',
    error: { code: 'DATABASE_UNAVAILABLE', message: 'App scan storage is temporarily unavailable.' },
  });
  return false;
}

router.get('/brands/:brandId/app-store-scans', validateBrandId, async (req, res) => {
  if (!ensureDatabase(res)) return;

  try {
    const brandExists = await Brand.exists({ _id: req.params.brandId });
    if (!brandExists) {
      return res.status(404).json({
        status: 'error',
        error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' },
      });
    }

    const scans = await AppStoreScan.find({ brandId: req.params.brandId, source: 'Apple App Store Search API' })
      .sort({ scannedAt: -1 })
      .limit(20);
    return res.json({ status: 'success', data: { scans } });
  } catch (error) {
    console.error(`App scan history failed (${error.name || 'Error'}).`);
    return res.status(503).json({
      status: 'error',
      error: { code: 'DATABASE_UNAVAILABLE', message: 'App scan history is temporarily unavailable.' },
    });
  }
});

router.post('/brands/:brandId/app-store-scans', validateBrandId, async (req, res) => {
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.' },
    });
  }
  if (typeof body.countryCode !== 'undefined' &&
      (typeof body.countryCode !== 'string' || !/^[a-z]{2}$/i.test(body.countryCode.trim()))) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'VALIDATION_ERROR', message: 'countryCode must be a two-letter country code.' },
    });
  }
  if (!ensureDatabase(res)) return;

  try {
    const brand = await Brand.findById(req.params.brandId);
    if (!brand) {
      return res.status(404).json({
        status: 'error',
        error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' },
      });
    }

    const scanResult = await searchAppleAppStore(brand, { countryCode: body.countryCode || 'US' });

    // Enrich findings with logo similarity if brand has a logoUrl.
    if (brand.logoUrl && scanResult.findings.length) {
      await Promise.all(scanResult.findings.map(async (finding) => {
        if (finding.iconUrl) {
          finding.logoSimilarity = await compareImageUrls(brand.logoUrl, finding.iconUrl);
          if (finding.logoSimilarity !== null && finding.logoSimilarity >= 70) {
            finding.score = Math.min(100, finding.score + 15);
            finding.reasons.push(`App icon is ${finding.logoSimilarity}% visually similar to the brand logo.`);
          }
        }
      }));
    }

    const scan = await AppStoreScan.create({ brandId: brand._id, ...scanResult });
    return res.status(201).json({ status: 'success', data: { scan } });
  } catch (error) {
    if (error instanceof AppStoreSearchError) {
      return res.status(502).json({
        status: 'error',
        error: { code: 'APP_STORE_UNAVAILABLE', message: error.message },
      });
    }
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        status: 'error',
        error: { code: 'VALIDATION_ERROR', message: 'Scan results failed validation.' },
      });
    }

    console.error(`App Store scan failed (${error.name || 'Error'}).`);
    return res.status(503).json({
      status: 'error',
      error: { code: 'APP_SCAN_FAILED', message: 'App Store scan could not be completed.' },
    });
  }
});

router.get('/brands/:brandId/domain-scans', validateBrandId, async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const brandExists = await Brand.exists({ _id: req.params.brandId });
    if (!brandExists) {
      return res.status(404).json({
        status: 'error',
        error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' },
      });
    }
    const scans = await DomainScan.find({ brandId: req.params.brandId })
      .sort({ analyzedAt: -1 })
      .limit(20);
    return res.json({ status: 'success', data: { scans } });
  } catch (error) {
    console.error(`Domain scan history failed (${error.name || 'Error'}).`);
    return res.status(503).json({
      status: 'error',
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Domain scan history is temporarily unavailable.' },
    });
  }
});

router.post('/brands/:brandId/domain-scans', validateBrandId, async (req, res) => {
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.' },
    });
  }
  if (typeof body.assessment !== 'object' || !body.assessment || !body.brandName) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'VALIDATION_ERROR', message: 'assessment and brandName are required.' },
    });
  }
  if (!ensureDatabase(res)) return;
  try {
    const brandExists = await Brand.exists({ _id: req.params.brandId });
    if (!brandExists) {
      return res.status(404).json({
        status: 'error',
        error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' },
      });
    }
    const { assessment, brandName } = body;
    const scan = await DomainScan.create({
      brandId: req.params.brandId,
      brandName,
      candidateUrl: assessment.candidateUrl,
      candidateHostname: assessment.candidateHostname,
      officialDomain: assessment.officialDomain,
      score: assessment.score,
      riskLevel: assessment.riskLevel,
      status: assessment.status,
      similarity: assessment.similarity,
      signals: assessment.signals || [],
      reasons: assessment.reasons || [],
      limitations: assessment.limitations || [],
      analyzedAt: new Date(),
    });
    return res.status(201).json({ status: 'success', data: { scan } });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        status: 'error',
        error: { code: 'VALIDATION_ERROR', message: 'Domain scan failed validation.' },
      });
    }
    console.error(`Domain scan save failed (${error.name || 'Error'}).`);
    return res.status(503).json({
      status: 'error',
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Domain scan could not be saved.' },
    });
  }
});

router.get('/brands/:brandId/google-play-scans', validateBrandId, async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const brandExists = await Brand.exists({ _id: req.params.brandId });
    if (!brandExists) {
      return res.status(404).json({ status: 'error', error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' } });
    }
    const scans = await AppStoreScan.find({ brandId: req.params.brandId, source: 'Google Play (Simulated)' })
      .sort({ scannedAt: -1 })
      .limit(20);
    return res.json({ status: 'success', data: { scans } });
  } catch (error) {
    console.error(`Google Play scan history failed (${error.name || 'Error'}).`);
    return res.status(503).json({ status: 'error', error: { code: 'DATABASE_UNAVAILABLE', message: 'Scan history is temporarily unavailable.' } });
  }
});

router.post('/brands/:brandId/google-play-scans', validateBrandId, async (req, res) => {
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.' } });
  }
  if (typeof body.countryCode !== 'undefined' &&
      (typeof body.countryCode !== 'string' || !/^[a-z]{2}$/i.test(body.countryCode.trim()))) {
    return res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'countryCode must be a two-letter country code.' } });
  }
  if (!ensureDatabase(res)) return;
  try {
    const brand = await Brand.findById(req.params.brandId);
    if (!brand) {
      return res.status(404).json({ status: 'error', error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' } });
    }
    const scanResult = searchGooglePlay(brand, { countryCode: body.countryCode || 'US' });

    // Enrich findings with logo similarity if brand has a logoUrl.
    if (brand.logoUrl && scanResult.findings.length) {
      await Promise.all(scanResult.findings.map(async (finding) => {
        if (finding.iconUrl) {
          finding.logoSimilarity = await compareImageUrls(brand.logoUrl, finding.iconUrl);
          if (finding.logoSimilarity !== null && finding.logoSimilarity >= 70) {
            finding.score = Math.min(100, finding.score + 15);
            finding.reasons.push(`App icon is ${finding.logoSimilarity}% visually similar to the brand logo.`);
          }
        }
      }));
    }

    const scan = await AppStoreScan.create({ brandId: brand._id, ...scanResult });
    return res.status(201).json({ status: 'success', data: { scan } });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'Scan results failed validation.' } });
    }
    console.error(`Google Play scan failed (${error.name || 'Error'}).`);
    return res.status(503).json({ status: 'error', error: { code: 'APP_SCAN_FAILED', message: 'Google Play scan could not be completed.' } });
  }
});

router.get('/brands/:brandId/social-scans', validateBrandId, async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const brandExists = await Brand.exists({ _id: req.params.brandId });
    if (!brandExists) {
      return res.status(404).json({ status: 'error', error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' } });
    }
    const scans = await SocialScan.find({ brandId: req.params.brandId })
      .sort({ analyzedAt: -1 })
      .limit(20);
    return res.json({ status: 'success', data: { scans } });
  } catch (error) {
    console.error(`Social scan history failed (${error.name || 'Error'}).`);
    return res.status(503).json({ status: 'error', error: { code: 'DATABASE_UNAVAILABLE', message: 'Social scan history is temporarily unavailable.' } });
  }
});

router.post('/brands/:brandId/social-scans', validateBrandId, async (req, res) => {
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.' } });
  }
  const required = ['brandName', 'candidateUsername', 'score', 'riskLevel', 'status'];
  for (const field of required) {
    if (!body[field] && body[field] !== 0) {
      return res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: `${field} is required.` } });
    }
  }
  if (!ensureDatabase(res)) return;
  try {
    const brandExists = await Brand.exists({ _id: req.params.brandId });
    if (!brandExists) {
      return res.status(404).json({ status: 'error', error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' } });
    }
    const scan = await SocialScan.create({
      brandId: req.params.brandId,
      brandName: body.brandName,
      platform: body.platform || '',
      candidateUsername: body.candidateUsername,
      officialReference: body.officialReference || '',
      score: body.score,
      riskLevel: body.riskLevel,
      status: body.status,
      reasons: body.reasons || [],
      limitations: body.limitations || [],
      paymentRequested: body.paymentRequested || false,
      credentialRequested: body.credentialRequested || false,
      analyzedAt: new Date(),
    });
    return res.status(201).json({ status: 'success', data: { scan } });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'Social scan failed validation.' } });
    }
    console.error(`Social scan save failed (${error.name || 'Error'}).`);
    return res.status(503).json({ status: 'error', error: { code: 'DATABASE_UNAVAILABLE', message: 'Social scan could not be saved.' } });
  }
});

router.get('/brands/:brandId/social-monitor-scans', validateBrandId, async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const brandExists = await Brand.exists({ _id: req.params.brandId });
    if (!brandExists) {
      return res.status(404).json({ status: 'error', error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' } });
    }
    const scans = await SocialMonitorScan.find({ brandId: req.params.brandId })
      .sort({ scannedAt: -1 })
      .limit(20);
    return res.json({ status: 'success', data: { scans } });
  } catch (error) {
    console.error(`Social monitor scan history failed (${error.name || 'Error'}).`);
    return res.status(503).json({ status: 'error', error: { code: 'DATABASE_UNAVAILABLE', message: 'Scan history is temporarily unavailable.' } });
  }
});

router.post('/brands/:brandId/social-monitor-scans', validateBrandId, async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const brand = await Brand.findById(req.params.brandId);
    if (!brand) {
      return res.status(404).json({ status: 'error', error: { code: 'BRAND_NOT_FOUND', message: 'Saved brand profile not found.' } });
    }
    const scanResult = scanAllPlatforms(brand);
    const scan = await SocialMonitorScan.create({ brandId: brand._id, ...scanResult });
    return res.status(201).json({ status: 'success', data: { scan } });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'Scan results failed validation.' } });
    }
    console.error(`Social monitor scan failed (${error.name || 'Error'}).`);
    return res.status(503).json({ status: 'error', error: { code: 'SCAN_FAILED', message: 'Social monitor scan could not be completed.' } });
  }
});

module.exports = router;