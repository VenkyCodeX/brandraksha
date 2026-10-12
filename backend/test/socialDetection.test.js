const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  SocialDetectionInputError,
  analyzeSocialCandidate,
  normalizeUsername,
} = require('../services/socialDetectionService');

test('exact case-insensitive official username is an official match', () => {
  const result = analyzeSocialCandidate({ officialUsername: 'Example', candidateUsername: '@EXAMPLE' });

  assert.equal(result.score, 0);
  assert.equal(result.status, 'OFFICIAL_MATCH');
  assert.equal(result.riskLevel, 'LOW');
});

test('a suspicious added role word is detected once with a close-reference score', () => {
  const result = analyzeSocialCandidate({ officialUsername: 'amazon', candidateUsername: 'amazon_support' });

  assert.ok(result.score >= 30);
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some((reason) => reason.includes('support')));
  assert.equal(result.reasons.filter((reason) => reason.includes('similar')).length, 1);
});

test('a zero-for-o substitution is treated as a near match, not an official match', () => {
  const result = analyzeSocialCandidate({ officialUsername: 'amazon', candidateUsername: 'amaz0n' });

  assert.ok(result.score > 0);
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some((reason) => reason.includes('substitution')));
});

test('a one-for-i substitution is also treated as a near match', () => {
  const result = analyzeSocialCandidate({ officialUsername: 'linkedin', candidateUsername: 'l1nked1n' });

  assert.ok(result.score > 0);
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some((reason) => reason.includes('substitution')));
});

test('an unrelated username receives a low score', () => {
  const result = analyzeSocialCandidate({ officialUsername: 'amazon', candidateUsername: 'mountain_bicycle' });

  assert.equal(result.score, 0);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.status, 'NEEDS_REVIEW');
});

test('payment contributes only when explicitly supplied as true', () => {
  const noSignal = analyzeSocialCandidate({ officialUsername: 'amazon', candidateUsername: 'unrelated' });
  const falseSignal = analyzeSocialCandidate({ officialUsername: 'amazon', candidateUsername: 'unrelated', paymentRequested: false });
  const trueSignal = analyzeSocialCandidate({ officialUsername: 'amazon', candidateUsername: 'unrelated', paymentRequested: true });

  assert.equal(noSignal.score, 0);
  assert.equal(falseSignal.score, 0);
  assert.equal(trueSignal.score, 30);
});

test('missing or invalid candidate input is rejected', () => {
  assert.throws(() => analyzeSocialCandidate({ officialUsername: 'amazon' }), SocialDetectionInputError);
  assert.throws(() => analyzeSocialCandidate({ officialUsername: 'amazon', candidateUsername: '---' }), SocialDetectionInputError);
  assert.throws(() => analyzeSocialCandidate({ officialUsername: 'amazon', candidateUsername: 'valid', paymentRequested: 'yes' }), SocialDetectionInputError);
});

test('score stays within 0 and 100 with all explicit signals', () => {
  const result = analyzeSocialCandidate({
    officialUsername: 'amazon',
    candidateUsername: 'amazon_security',
    paymentRequested: true,
    credentialRequested: true,
  });

  assert.ok(Number.isInteger(result.score));
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.riskLevel, 'CRITICAL');
});

test('missing official reference returns an explicit limitation', () => {
  const result = analyzeSocialCandidate({ candidateUsername: 'candidate_support' });

  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.limitations.some((item) => item.includes('No official reference')));
  assert.equal(result.reasons.some((item) => item.includes('similar')), false);
});

test('normalization is consistent for case and separators', () => {
  assert.equal(normalizeUsername('  @Ama.z_on-Help '), 'amazonhelp');
  assert.equal(normalizeUsername('AMAZON HELP'), 'amazonhelp');
});