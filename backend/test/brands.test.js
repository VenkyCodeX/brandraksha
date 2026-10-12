const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
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