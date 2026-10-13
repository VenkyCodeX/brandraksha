const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');
const { app } = require('../server');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function postBrand(body) {
  return fetch(`${baseUrl}/api/brands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
  });
}

async function postAnalysis(body) {
  return fetch(`${baseUrl}/api/analyze/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
  });
}

async function postWebsiteAnalysis(body) {
  return fetch(`${baseUrl}/api/analyze/website`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
  });
}

async function postAppStoreScan(brandId, body) {
  return fetch(`${baseUrl}/api/brands/${brandId}/app-store-scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
  });
}

async function getAppStoreScans(brandId) {
  return fetch(`${baseUrl}/api/brands/${brandId}/app-store-scans`, {
    headers: { Connection: 'close' },
  });
}

test('health endpoint remains available', async () => {
  const response = await fetch(`${baseUrl}/api/health`, { headers: { Connection: 'close' } });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, 'success');
});

test('brand creation rejects a missing required name without a database call', async () => {
  const response = await postBrand({ websiteUrl: 'https://example.com' });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.status, 'error');
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
  assert.ok(payload.error.details.includes('brandName is required.'));
});

test('brand creation rejects invalid URLs and duplicate assets', async () => {
  const response = await postBrand({
    brandName: 'Example Brand',
    logoUrl: 'javascript:alert(1)',
    socialAccounts: [
      { platform: 'Instagram', username: '@example' },
      { platform: 'Instagram', username: 'EXAMPLE' },
    ],
    officialApps: [
      { appName: 'Example One', packageId: 'com.example.app', storeUrl: 'not a URL' },
      { appName: 'Example Two', packageId: 'COM.EXAMPLE.APP' },
    ],
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.ok(payload.error.details.some((detail) => detail.includes('logoUrl')));
  assert.ok(payload.error.details.some((detail) => detail.includes('Duplicate social account')));
  assert.ok(payload.error.details.some((detail) => detail.includes('Duplicate package or bundle ID')));
  assert.ok(payload.error.details.some((detail) => detail.includes('storeUrl')));
});

test('brand endpoints reject malformed MongoDB IDs before querying', async () => {
  const response = await fetch(`${baseUrl}/api/brands/not-an-object-id`, { headers: { Connection: 'close' } });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'INVALID_ID');
});

test('profile analyzer preserves the legacy request shape and response fields', async () => {
  const response = await postAnalysis({
    officialUsername: 'example',
    suspiciousUsername: 'example_support',
    paymentRequested: false,
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, 'NEEDS_REVIEW');
  assert.equal(payload.suspiciousUsername, 'example_support');
  assert.equal(payload.candidateUsername, 'example_support');
  assert.equal(payload.score, payload.riskScore);
  assert.ok(payload.score >= 0 && payload.score <= 100);
});

test('profile analyzer reports missing official references without inventing a comparison', async () => {
  const response = await postAnalysis({ candidateUsername: 'candidate_support' });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, 'NEEDS_REVIEW');
  assert.ok(payload.limitations.some((item) => item.includes('No official reference')));
});

test('profile analyzer returns a consistent validation error for a missing candidate', async () => {
  const response = await postAnalysis({ officialUsername: 'example' });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.status, 'error');
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});

test('profile analyzer rejects malformed saved-brand IDs', async () => {
  const response = await postAnalysis({ brandId: 'not-an-object-id', candidateUsername: 'candidate' });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'INVALID_ID');
});

test('saved-brand analysis does not fall back to a client official reference', async (context) => {
  if (mongoose.connection.readyState === 1) {
    context.skip('Requires MongoDB to be disconnected.');
    return;
  }

  const response = await postAnalysis({
    brandId: '507f1f77bcf86cd799439011',
    officialUsername: 'client_supplied_reference',
    candidateUsername: 'candidate',
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error.code, 'DATABASE_UNAVAILABLE');
});

test('app store scan rejects malformed brand IDs', async () => {
  const response = await fetch(`${baseUrl}/api/brands/invalid/app-store-scans`, { headers: { Connection: 'close' } });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'INVALID_ID');
});

test('app store scan validates country code before database access', async () => {
  const response = await postAppStoreScan('507f1f77bcf86cd799439011', { countryCode: 'USA' });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});

test('app store history reports unavailable database instead of fabricated scans', async () => {
  if (mongoose.connection.readyState === 1) return;
  const response = await getAppStoreScans('507f1f77bcf86cd799439011');
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error.code, 'DATABASE_UNAVAILABLE');
});

test('brand creation normalizes official domains and rejects duplicates', async () => {
  const response = await postBrand({
    brandName: 'Example Brand',
    officialDomains: ['https://Example.com/', 'example.com'],
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.ok(payload.error.details.includes('officialDomains cannot contain duplicates after normalization.'));
});

test('website analysis validates required brand and candidate inputs', async () => {
  const missingBrand = await postWebsiteAnalysis({ candidateUrl: 'https://candidate.example' });
  const missingBrandBody = await missingBrand.json();
  const missingCandidate = await postWebsiteAnalysis({ brandId: '507f1f77bcf86cd799439011' });
  const missingCandidateBody = await missingCandidate.json();

  assert.equal(missingBrand.status, 400);
  assert.equal(missingBrandBody.error.code, 'VALIDATION_ERROR');
  assert.equal(missingCandidate.status, 400);
  assert.equal(missingCandidateBody.error.code, 'VALIDATION_ERROR');
});

test('website analysis rejects malformed brand IDs', async () => {
  const response = await postWebsiteAnalysis({ brandId: 'not-an-id', candidateUrl: 'https://candidate.example' });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'INVALID_ID');
});

test('website analysis reports unavailable database without accepting client reference domains', async (context) => {
  if (mongoose.connection.readyState === 1) {
    context.skip('Requires MongoDB to be disconnected.');
    return;
  }
  const response = await postWebsiteAnalysis({
    brandId: '507f1f77bcf86cd799439011',
    candidateUrl: 'https://candidate.example',
    officialDomains: ['candidate.example'],
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error.code, 'DATABASE_UNAVAILABLE');
});
