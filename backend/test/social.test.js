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

async function postScan(body) {
  return fetch(`${baseUrl}/api/social/scan-candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
  });
}

test('manual candidate ingestion works without provider credentials and uses the detector', async () => {
  const response = await postScan({
    brandName: 'Amazon',
    officialAccounts: [{ platform: 'Instagram', username: 'amazon' }],
    candidates: [{ platform: 'Instagram', username: 'amazon_support' }],
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.source, 'MANUAL_INPUT');
  assert.equal(payload.scanStatus, 'MANUAL_ONLY');
  assert.equal(payload.findings[0].source, 'MANUAL_INPUT');
  assert.ok(payload.findings[0].analysis.reasons.some((reason) => reason.includes('support')));
  assert.deepEqual(payload.findings[0].providerResults, []);
  assert.equal(payload.persistence.status, 'NOT_AVAILABLE');
});

test('profile URLs can supply a candidate username without fetching that URL', async () => {
  const response = await postScan({
    brandName: 'Amazon',
    candidates: [{ platform: 'instagram', profileUrl: 'https://www.instagram.com/amazon_help/?access_token=private-value#profile' }],
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.findings[0].candidate.username, 'amazon_help');
  assert.equal(payload.findings[0].candidate.profileUrl, 'https://www.instagram.com/amazon_help/');
  assert.equal(JSON.stringify(payload).includes('private-value'), false);
});

test('invalid candidates are rejected before analysis', async () => {
  const response = await postScan({
    brandName: 'Amazon',
    candidates: [{ platform: 'Instagram', profileUrl: 'javascript:alert(1)' }],
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});

test('distinct punctuation-bearing handles are not collapsed as duplicates', async () => {
  const response = await postScan({
    brandName: 'Example',
    candidates: [
      { platform: 'Instagram', username: 'example.one' },
      { platform: 'Instagram', username: 'example_one' },
    ],
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.candidateCount, 2);
});

test('missing provider credentials produce NOT_CONFIGURED and no profile claim', async () => {
  const previousToken = process.env.X_BEARER_TOKEN;
  delete process.env.X_BEARER_TOKEN;
  try {
    const response = await postScan({
      brandName: 'Example',
      candidates: [{ platform: 'X', username: 'candidate' }],
      providers: ['X_API'],
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.findings[0].providerResults[0].status, 'NOT_CONFIGURED');
    assert.equal(payload.findings[0].providerResults[0].profile, undefined);
    assert.equal(payload.findings[0].analysis.status, 'NEEDS_REVIEW');
  } finally {
    if (previousToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = previousToken;
  }
});

test('provider failures and rate limits are returned without credentials', async () => {
  const originalFetch = global.fetch;
  const previousToken = process.env.X_BEARER_TOKEN;
  process.env.X_BEARER_TOKEN = 'response-must-not-contain-this-secret';
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.x.com/')) return { status: 429, ok: false };
    return originalFetch(url, options);
  };
  try {
    const response = await postScan({
      brandName: 'Example',
      candidates: [{ platform: 'X', username: 'candidate' }],
      providers: ['X_API'],
    });
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(text, /RATE_LIMITED/);
    assert.equal(text.includes('response-must-not-contain-this-secret'), false);
  } finally {
    global.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = previousToken;
  }
});

test('brand ID mode uses saved official accounts instead of supplied alternatives', async () => {
  const originalFindById = Brand.findById;
  Brand.findById = async () => ({
    _id: '507f1f77bcf86cd799439011',
    brandName: 'Amazon',
    socialAccounts: [{ platform: 'Instagram', username: 'amazon' }],
  });

  try {
    const response = await postScan({
      brandId: '507f1f77bcf86cd799439011',
      brandName: 'Untrusted Name',
      officialAccounts: [{ platform: 'Instagram', username: 'untrusted' }],
      candidates: [{ platform: 'Instagram', username: 'amazon' }],
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.brand.name, 'Amazon');
    assert.equal(payload.findings[0].analysis.status, 'OFFICIAL_MATCH');
  } finally {
    Brand.findById = originalFindById;
  }
});