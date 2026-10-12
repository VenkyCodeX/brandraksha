const assert = require('node:assert/strict');
const { test } = require('node:test');
const { scanCandidates } = require('../services/socialCandidateScanService');

const brand = {
  brandName: 'Amazon',
  socialAccounts: [{ platform: 'Instagram', username: 'amazon' }],
};

test('manual candidate scans reuse detection without contacting providers', async () => {
  let providerCalls = 0;
  const result = await scanCandidates({
    brand,
    candidates: [{ platform: 'Instagram', username: 'amazon_support' }],
    providerAdapters: {
      X_API: { lookupProfile: async () => { providerCalls += 1; return { status: 'FOUND' }; } },
    },
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.source, 'MANUAL_INPUT');
  assert.equal(result.scanStatus, 'MANUAL_ONLY');
  assert.ok(result.findings[0].analysis.reasons.some((reason) => reason.includes('support')));
  assert.deepEqual(result.findings[0].providerResults, []);
});

test('provider failures are sanitized and never turn into a safe finding', async () => {
  const result = await scanCandidates({
    brand,
    candidates: [{ platform: 'Instagram', username: 'unrelated_handle' }],
    providers: ['META_INSTAGRAM'],
    providerAdapters: {
      META_INSTAGRAM: {
        lookupProfile: async () => ({ status: 'RATE_LIMITED', message: 'Wait; bearer=secret-value' }),
      },
    },
  });

  assert.equal(result.scanStatus, 'COMPLETED_WITH_PROVIDER_LIMITATIONS');
  assert.equal(result.findings[0].source, 'MANUAL_INPUT');
  assert.equal(result.findings[0].analysis.status, 'NEEDS_REVIEW');
  assert.equal(result.providerErrors[0].status, 'RATE_LIMITED');
  assert.equal(JSON.stringify(result).includes('secret-value'), false);
});

test('provider-returned profile text is scrubbed before it reaches the response', async () => {
  const previousToken = process.env.X_BEARER_TOKEN;
  process.env.X_BEARER_TOKEN = 'profile-secret-value';
  try {
    const result = await scanCandidates({
      brand,
      candidates: [{ platform: 'X', username: 'candidate' }],
      providers: ['X_API'],
      providerAdapters: {
        X_API: {
          lookupProfile: async () => ({
            status: 'FOUND',
            profile: { platform: 'X', username: 'candidate', displayName: 'profile-secret-value' },
          }),
        },
      },
    });

    assert.equal(JSON.stringify(result).includes('profile-secret-value'), false);
  } finally {
    if (previousToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = previousToken;
  }
});