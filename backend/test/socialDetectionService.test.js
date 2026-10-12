const assert = require('node:assert/strict');
const { test } = require('node:test');
const { analyzeSocialProfile } = require('../services/socialDetectionService');

const officialAccounts = [{ platform: 'Instagram', username: 'amazon' }];

function analyze(suspiciousUsername, options = {}) {
  return analyzeSocialProfile({
    brandName: 'Amazon',
    officialAccounts,
    platform: 'Instagram',
    suspiciousUsername,
    ...options,
  });
}

test('exact official account match is excluded from suspicious classification', () => {
  const result = analyze('@AMAZON');

  assert.equal(result.status, 'OFFICIAL_MATCH');
  assert.equal(result.riskScore, 0);
  assert.equal(result.matchedOfficialAccount.username, 'amazon');
});

test('added suspicious words produce distinct explainable signals', () => {
  const result = analyze('amazon_support');

  assert.ok(result.riskScore >= 30);
  assert.ok(result.evidence.some((item) => item.signal === 'added_or_removed_text'));
  assert.ok(result.evidence.some((item) => item.signal === 'suspicious_terms'));
});

test('digit lookalike substitutions are detected against an official handle', () => {
  const result = analyze('amaz0n');

  assert.ok(result.evidence.some((item) => item.signal === 'lookalike_substitution'));
});

test('unrelated usernames are not automatically classified as fraudulent', () => {
  const result = analyze('gardenphotos');

  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.equal(result.riskScore, 0);
});

test('reported behavior affects score only when explicitly supplied', () => {
  const unreported = analyze('gardenphotos');
  const explicitlyReported = analyze('gardenphotos', { reportedSignals: { paymentRequested: true } });

  assert.equal(unreported.riskScore, 0);
  assert.ok(explicitlyReported.riskScore > unreported.riskScore);
  assert.ok(explicitlyReported.evidence.some((item) => item.signal === 'payment_reported'));
});

test('invalid input is rejected safely', () => {
  assert.throws(() => analyzeSocialProfile({}), /brandName is required/);
  assert.throws(() => analyze('validname', { reportedSignals: { paymentRequested: 'yes' } }), /must be a boolean/);
});

test('scores remain within the supported range', () => {
  const result = analyze('amazon_support_official', {
    reportedSignals: { paymentRequested: true, credentialRequested: true },
  });

  assert.ok(result.riskScore >= 0 && result.riskScore <= 100);
});

test('scoring weights can be overridden and invalid overrides are rejected', () => {
  const result = analyze('amazon_support', {
    scoring: { addedOrRemovedText: 1, brandNameMention: 1, suspiciousTerms: 1 },
  });

  assert.equal(result.riskScore, 3);
  assert.throws(() => analyze('amazon_support', { scoring: { identityCap: 101 } }), /must not exceed 100/);
});

test('missing official accounts clearly limit the comparison', () => {
  const result = analyzeSocialProfile({
    brandName: 'Amazon',
    officialAccounts: [],
    platform: 'Instagram',
    suspiciousUsername: 'amazon_help',
  });

  assert.match(result.limitations[0], /No official social accounts are registered/);
  assert.equal(result.status, 'NEEDS_REVIEW');
});

test('case and separator variants normalize consistently without claiming an exact official match', () => {
  const result = analyze('@AMAZON.Support', {
    officialAccounts: [{ platform: 'instagram', username: 'amazon_support' }],
  });

  assert.equal(result.normalizedUsername, 'amazonsupport');
  assert.notEqual(result.status, 'OFFICIAL_MATCH');
  assert.ok(result.evidence.some((item) => item.signal === 'separator_normalized_match'));
});