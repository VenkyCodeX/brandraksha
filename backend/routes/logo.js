const express = require('express');
const mongoose = require('mongoose');
const Brand = require('../models/Brand');
const { compareLogoImages } = require('../services/logoSimilarityService');

const router = express.Router();

router.post('/logo', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'Request body must be a JSON object.' } });
  }
  if (typeof body.brandId !== 'string' || !mongoose.isObjectIdOrHexString(body.brandId)) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_ID', message: 'A valid saved brand ID is required.' } });
  }
  if (typeof body.candidateImageUrl !== 'string' || !body.candidateImageUrl.trim() || body.candidateImageUrl.length > 2048) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'candidateImageUrl is required and must be at most 2048 characters.' } });
  }
  for (const field of ['candidateId', 'candidateUsername']) {
    if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].length > 120)) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: `${field} must be a string of at most 120 characters.` } });
    }
  }

  let brand;
  try {
    brand = await Brand.findById(body.brandId);
  } catch (error) {
    console.error(`[logo-analysis] brand lookup failed (${error.name || 'Error'}).`);
    return res.status(503).json({ ok: false, error: { code: 'DATABASE_ERROR', message: 'Saved brand profiles are temporarily unavailable.' } });
  }
  if (!brand) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Brand profile not found.' } });
  }

  const comparison = await compareLogoImages({
    officialLogoUrl: brand.logoUrl,
    candidateImageUrl: body.candidateImageUrl.trim(),
  });
  return res.json({
    ok: true,
    brand: { id: String(brand._id || body.brandId), name: brand.brandName },
    candidate: {
      id: body.candidateId || null,
      username: body.candidateUsername || null,
    },
    ...comparison,
  });
});

module.exports = router;