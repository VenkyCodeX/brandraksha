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

async function postLogo(body) {
  return fetch(`${baseUrl}/api/analyze/logo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
  });
}

test('logo endpoint returns REFERENCE_IMAGE_MISSING without inventing a score', async () => {
  const originalFindById = Brand.findById;
  Brand.findById = async () => ({
    _id: '507f1f77bcf86cd799439011',
    brandName: 'Example Brand',
    logoUrl: '',
  });
  try {
    const response = await postLogo({
      brandId: '507f1f77bcf86cd799439011',
      candidateImageUrl: 'https://images.example/candidate.png',
      candidateUsername: 'candidate',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'REFERENCE_IMAGE_MISSING');
    assert.equal(payload.similarityScore, null);
    assert.equal(payload.brand.name, 'Example Brand');
    assert.equal(payload.candidate.username, 'candidate');
  } finally {
    Brand.findById = originalFindById;
  }
});

test('logo endpoint rejects malformed IDs and missing candidate images', async () => {
  const invalidId = await postLogo({ brandId: 'not-an-id', candidateImageUrl: 'https://images.example/candidate.png' });
  const missingImage = await postLogo({ brandId: '507f1f77bcf86cd799439011' });

  assert.equal(invalidId.status, 400);
  assert.equal(missingImage.status, 400);
});

test('unsafe saved logo destinations fail without returning a similarity score', async () => {
  const originalFindById = Brand.findById;
  Brand.findById = async () => ({
    _id: '507f1f77bcf86cd799439011',
    brandName: 'Example Brand',
    logoUrl: 'http://127.0.0.1/internal.png',
  });
  try {
    const response = await postLogo({
      brandId: '507f1f77bcf86cd799439011',
      candidateImageUrl: 'https://images.example/candidate.png',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'UNSAFE_URL');
    assert.equal(payload.similarityScore, null);
    assert.equal(JSON.stringify(payload).includes('127.0.0.1'), false);
  } finally {
    Brand.findById = originalFindById;
  }
});