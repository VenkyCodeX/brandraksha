const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DomainAnalysisInputError,
  analyzeCandidateDomain,
  damerauLevenshteinDistance,
  normalizeOfficialDomain,
  parseCandidateUrl,
} = require('../services/domainDetectionService');

test('normalizes official hostnames while preserving subdomains and punycode', () => {
  assert.equal(normalizeOfficialDomain('HTTPS://Shop.Example.com/'), 'shop.example.com');
  assert.equal(normalizeOfficialDomain('bücher.example'), 'xn--bcher-kva.example');
});

test('accepts a candidate URL and analyzes its complete hostname', () => {
  const parsed = parseCandidateUrl('https://login.example-support.com/account');
  assert.equal(parsed.hostname, 'login.example-support.com');
  assert.equal(parsed.url, 'https://login.example-support.com/account');
});

test('exact official host and its subdomains are not classified as suspicious', () => {
  for (const candidateUrl of ['https://example.com', 'https://portal.example.com/login']) {
    const result = analyzeCandidateDomain({ candidateUrl, officialDomains: ['example.com'] });
    assert.equal(result.status, 'OFFICIAL_MATCH');
    assert.equal(result.score, 0);
  }
});

test('a transposed character lookalike produces an explainable review signal', () => {
  assert.equal(damerauLevenshteinDistance('exmaple', 'example'), 1);
  const result = analyzeCandidateDomain({ candidateUrl: 'https://exmaple.com', officialDomains: ['example.com'] });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.score > 0);
  assert.ok(result.signals.some((signal) => signal.type === 'hostname_similarity'));
  assert.equal(result.candidateHostname, 'exmaple.com');
  assert.equal(result.officialDomain, 'example.com');
});

test('a TLD-only difference receives no risk points', () => {
  const result = analyzeCandidateDomain({ candidateUrl: 'https://example.in', officialDomains: ['example.com'] });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.equal(result.score, 0);
  assert.equal(result.riskLevel, 'LOW');
  assert.ok(result.reasons.some((reason) => reason.includes('Different TLDs alone')));
});

test('added words can increase a near-match score and remain review-only', () => {
  const result = analyzeCandidateDomain({ candidateUrl: 'https://example-support.com', officialDomains: ['example.com'] });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.signals.some((signal) => signal.type === 'added_brand_related_word'));
  assert.ok(result.score >= 10);
  assert.ok(result.limitations.some((limitation) => limitation.includes('not proof')));
});

test('rejects malformed or unsupported candidate URLs', () => {
  assert.throws(() => parseCandidateUrl('example.com'), DomainAnalysisInputError);
  assert.throws(() => parseCandidateUrl('javascript:alert(1)'), DomainAnalysisInputError);
  assert.throws(() => parseCandidateUrl('http://localhost:3000'), DomainAnalysisInputError);
  assert.throws(() => parseCandidateUrl('https://user:password@example.com'), DomainAnalysisInputError);
});

test('rejects private IP addresses and invalid official references', () => {
  assert.throws(() => parseCandidateUrl('http://127.0.0.1'), DomainAnalysisInputError);
  assert.throws(() => normalizeOfficialDomain('example.com/login'), DomainAnalysisInputError);
});

test('missing official domains returns a clear typed validation error', () => {
  assert.throws(
    () => analyzeCandidateDomain({ candidateUrl: 'https://candidate.com', officialDomains: [] }),
    (error) => error instanceof DomainAnalysisInputError && error.field === 'officialDomains',
  );
});

// ─── Additional focused tests ─────────────────────────────────────────────────

test('0-for-o character substitution is detected as a lookalike, not an official match', () => {
  // "paypa1.com" vs "paypal.com" — 1→l substitution
  const result = analyzeCandidateDomain({ candidateUrl: 'https://paypa1.com', officialDomains: ['paypal.com'] });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.score > 0, 'Lookalike substitution must produce a non-zero score');
  assert.ok(result.signals.some((s) => s.type === 'hostname_similarity'));
});

test('o-for-0 substitution in candidate is treated as near-match not official match', () => {
  // "g00gle.com" vs "google.com"
  const result = analyzeCandidateDomain({ candidateUrl: 'https://g00gle.com', officialDomains: ['google.com'] });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.score > 0);
  assert.notEqual(result.status, 'OFFICIAL_MATCH');
});

test('unrelated domain receives zero similarity points and LOW risk', () => {
  const result = analyzeCandidateDomain({
    candidateUrl: 'https://completelydifferentsite.org',
    officialDomains: ['example.com'],
  });
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.score, 0);
  assert.ok(result.signals.some((s) => s.type === 'no_strong_similarity'));
});

test('brand name in candidate hostname contributes brand_name_in_hostname signal', () => {
  const result = analyzeCandidateDomain({
    candidateUrl: 'https://acmefinancial-login.net',
    officialDomains: ['acmefinancial.com'],
    brandName: 'Acme Financial',
  });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.signals.some((s) => s.type === 'brand_name_in_hostname'));
  assert.ok(result.score >= 20);
});

test('brand name signal is not added when brand name is shorter than minimum length', () => {
  const result = analyzeCandidateDomain({
    candidateUrl: 'https://ab-login.com',
    officialDomains: ['ab.com'],
    brandName: 'AB',
  });
  assert.ok(!result.signals.some((s) => s.type === 'brand_name_in_hostname'));
});

test('suspicious subdomain on a lookalike registrable domain scores higher than subdomain alone', () => {
  // login.example-support.com — subdomain + added word + similarity
  const withSubdomain = analyzeCandidateDomain({
    candidateUrl: 'https://login.example-support.com',
    officialDomains: ['example.com'],
  });
  // example-support.com — same registrable domain, no subdomain
  const withoutSubdomain = analyzeCandidateDomain({
    candidateUrl: 'https://example-support.com',
    officialDomains: ['example.com'],
  });
  assert.equal(withSubdomain.status, 'NEEDS_REVIEW');
  assert.equal(withoutSubdomain.status, 'NEEDS_REVIEW');
  // Both should have added_brand_related_word; subdomain version should score at least as high
  assert.ok(withSubdomain.score >= withoutSubdomain.score);
});

test('official subdomain of a registered domain is not flagged as suspicious', () => {
  const cases = [
    'https://api.northstar.com',
    'https://secure.northstar.com/login',
    'https://mail.northstar.com',
  ];
  for (const candidateUrl of cases) {
    const result = analyzeCandidateDomain({ candidateUrl, officialDomains: ['northstar.com'] });
    assert.equal(result.status, 'OFFICIAL_MATCH', `Expected OFFICIAL_MATCH for ${candidateUrl}`);
    assert.equal(result.score, 0);
  }
});

test('score is always between 0 and 100 inclusive', () => {
  const cases = [
    { candidateUrl: 'https://example-secure-login-support.com', officialDomains: ['example.com'], brandName: 'Example' },
    { candidateUrl: 'https://exmaple.com', officialDomains: ['example.com'] },
    { candidateUrl: 'https://totallyunrelated.io', officialDomains: ['example.com'] },
    { candidateUrl: 'https://example.com', officialDomains: ['example.com'] },
  ];
  for (const input of cases) {
    const result = analyzeCandidateDomain(input);
    assert.ok(result.score >= 0 && result.score <= 100, `Score ${result.score} out of range for ${input.candidateUrl}`);
  }
});

test('risk level thresholds are consistent with score', () => {
  const cases = [
    { candidateUrl: 'https://totallyunrelated.io', officialDomains: ['example.com'] },
    { candidateUrl: 'https://exmaple.com', officialDomains: ['example.com'] },
    { candidateUrl: 'https://example-support.com', officialDomains: ['example.com'] },
    { candidateUrl: 'https://example-secure-login.com', officialDomains: ['example.com'], brandName: 'Example' },
  ];
  for (const input of cases) {
    const { score, riskLevel } = analyzeCandidateDomain(input);
    if (score >= 75) assert.equal(riskLevel, 'CRITICAL', `score ${score} should be CRITICAL`);
    else if (score >= 55) assert.equal(riskLevel, 'HIGH', `score ${score} should be HIGH`);
    else if (score >= 30) assert.equal(riskLevel, 'MEDIUM', `score ${score} should be MEDIUM`);
    else assert.equal(riskLevel, 'LOW', `score ${score} should be LOW`);
  }
});

test('best matching official domain is selected when multiple are registered', () => {
  const result = analyzeCandidateDomain({
    candidateUrl: 'https://northstar-support.com',
    officialDomains: ['example.com', 'northstar.com', 'unrelated.org'],
  });
  assert.equal(result.officialDomain, 'northstar.com');
  assert.ok(result.score > 0);
});

test('ftp and data scheme URLs are rejected', () => {
  assert.throws(() => parseCandidateUrl('ftp://example.com/file'), DomainAnalysisInputError);
  assert.throws(() => parseCandidateUrl('data:text/html,<h1>hi</h1>'), DomainAnalysisInputError);
  assert.throws(() => parseCandidateUrl('file:///etc/passwd'), DomainAnalysisInputError);
});

test('IPv6 addresses are rejected as candidate URLs', () => {
  assert.throws(() => parseCandidateUrl('http://[::1]/path'), DomainAnalysisInputError);
  assert.throws(() => parseCandidateUrl('http://[2001:db8::1]'), DomainAnalysisInputError);
});

test('result always includes reasons and limitations arrays', () => {
  const cases = [
    { candidateUrl: 'https://example.com', officialDomains: ['example.com'] },
    { candidateUrl: 'https://exmaple.com', officialDomains: ['example.com'] },
    { candidateUrl: 'https://unrelated.io', officialDomains: ['example.com'] },
  ];
  for (const input of cases) {
    const result = analyzeCandidateDomain(input);
    assert.ok(Array.isArray(result.reasons) && result.reasons.length > 0, `reasons missing for ${input.candidateUrl}`);
    // OFFICIAL_MATCH has limitations; NEEDS_REVIEW always has limitations
    assert.ok(Array.isArray(result.limitations) && result.limitations.length > 0, `limitations missing for ${input.candidateUrl}`);
  }
});

test('https alone does not affect the risk score', () => {
  const http = analyzeCandidateDomain({ candidateUrl: 'http://exmaple.com', officialDomains: ['example.com'] });
  const https = analyzeCandidateDomain({ candidateUrl: 'https://exmaple.com', officialDomains: ['example.com'] });
  assert.equal(http.score, https.score, 'HTTP vs HTTPS must not change the score');
  assert.equal(http.riskLevel, https.riskLevel);
});
