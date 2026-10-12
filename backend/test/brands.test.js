const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { app } = require('../server');
const Brand = require('../models/Brand');

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

async function postProfile(body) {
  return fetch(`${baseUrl}/api/analyze/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
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

test('profile analysis accepts manual brand references and returns structured heuristic results', async () => {
  const response = await postProfile({
    platform: 'instagram',
    brandName: 'Amazon',
    officialAccounts: [{ platform: 'Instagram', username: 'amazon' }],
    suspiciousUsername: 'amazon_support',
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'NEEDS_REVIEW');
  assert.equal(payload.suspiciousUsername, 'amazon_support');
  assert.equal(payload.candidate.platform, 'Instagram');
  assert.ok(payload.reasons.some((reason) => reason.includes('support')));
  assert.match(payload.disclaimer, /not a probability or proof of fraud/);
});

test('profile analysis validates missing and invalid inputs', async () => {
  const missing = await postProfile({ brandName: 'Amazon', officialAccounts: [], suspiciousUsername: '' });
  const missingPayload = await missing.json();
  const invalid = await postProfile({
    platform: 'Unknown Network',
    brandName: 'Amazon',
    officialAccounts: [],
    suspiciousUsername: 'candidate',
    reportedSignals: { paymentRequested: 'yes' },
  });
  const invalidPayload = await invalid.json();

  assert.equal(missing.status, 400);
  assert.equal(missingPayload.error.code, 'VALIDATION_ERROR');
  assert.equal(invalid.status, 400);
  assert.equal(invalidPayload.error.code, 'VALIDATION_ERROR');
});

test('saved brand references take precedence over supplied official account lists', async () => {
  const originalFindById = Brand.findById;
  Brand.findById = async () => ({
    brandName: 'Amazon',
    socialAccounts: [{ platform: 'Instagram', username: 'amazon' }],
  });

  try {
    const response = await postProfile({
      brandId: '507f1f77bcf86cd799439011',
      platform: 'Instagram',
      suspiciousUsername: 'amazon',
      officialAccounts: [{ platform: 'Instagram', username: 'not-the-saved-account' }],
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'OFFICIAL_MATCH');
    assert.equal(payload.evidence[0].signal, 'official_account_match');
    assert.equal(payload.matchedOfficialAccount.username, 'amazon');
  } finally {
    Brand.findById = originalFindById;
  }
});