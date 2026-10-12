'use strict';

// Simulated social platform monitoring service.
// No live social platform APIs are used. Candidates are generated
// deterministically from the brand profile using real-world impersonation
// patterns and scored with the same heuristics as manual analysis.

const { analyzeSocialCandidate, normalizeUsername } = require('./socialDetectionService');

const PLATFORMS = ['Instagram', 'Facebook', 'X', 'LinkedIn', 'YouTube'];

const FINDING_SCORE_THRESHOLD = 25;

// Common impersonation patterns threat actors use
const PATTERNS = [
  (n) => `${n}_official`,
  (n) => `${n}_support`,
  (n) => `${n}_help`,
  (n) => `${n}_helpdesk`,
  (n) => `${n}_verify`,
  (n) => `${n}_care`,
  (n) => `${n}_service`,
  (n) => `${n}official`,
  (n) => `${n}support`,
  (n) => `${n}help`,
  (n) => `official_${n}`,
  (n) => `support_${n}`,
  (n) => `real${n}`,
  (n) => `the${n}`,
  (n) => `${n}.official`,
  (n) => `${n}.support`,
  // lookalike substitutions
  (n) => n.replace(/o/g, '0'),
  (n) => n.replace(/i/g, '1'),
  (n) => n.replace(/l/g, '1'),
  (n) => n.replace(/a/g, '@'),
  // spacing / separator variants
  (n) => `${n}_`,
  (n) => `_${n}`,
  (n) => `${n}__official`,
  // regional / scam suffixes
  (n) => `${n}_india`,
  (n) => `${n}_us`,
  (n) => `${n}_global`,
  (n) => `${n}_scam_alert`,
];

// Platform-specific profile URL builders
const PROFILE_URL = {
  Instagram: (u) => `https://www.instagram.com/${u}/`,
  Facebook:  (u) => `https://www.facebook.com/${u}`,
  X:         (u) => `https://x.com/${u}`,
  LinkedIn:  (u) => `https://www.linkedin.com/company/${u}`,
  YouTube:   (u) => `https://www.youtube.com/@${u}`,
};

function buildCandidates(brand, platform) {
  const base = normalizeUsername(brand.brandName);
  if (!base) return [];

  const seen = new Set();
  const candidates = [];

  for (const pattern of PATTERNS) {
    const username = pattern(base);
    if (!username || seen.has(username)) continue;
    seen.add(username);
    candidates.push({
      username,
      platform,
      profileUrl: PROFILE_URL[platform]?.(username) || '',
      _simulated: true,
    });
  }

  return candidates;
}

function isOfficialAccount(username, brand, platform) {
  const normalized = normalizeUsername(username);
  return (brand.socialAccounts || []).some((acc) => {
    if (platform && acc.platform !== platform) return false;
    return normalizeUsername(acc.username) === normalized;
  });
}

function assessCandidate(candidate, brand) {
  const officialUsernames = (brand.socialAccounts || [])
    .filter((acc) => acc.platform === candidate.platform)
    .map((acc) => ({ username: acc.username, platform: acc.platform }));

  return analyzeSocialCandidate({
    officialUsernames,
    candidateUsername: candidate.username,
  });
}

function scanPlatform(brand, platform) {
  const candidates = buildCandidates(brand, platform);
  const officialMatches = [];
  const findings = [];

  for (const candidate of candidates) {
    if (isOfficialAccount(candidate.username, brand, platform)) {
      officialMatches.push({ username: candidate.username, platform });
      continue;
    }
    const result = assessCandidate(candidate, brand);
    if (result.status === 'OFFICIAL_MATCH') {
      officialMatches.push({ username: candidate.username, platform });
      continue;
    }
    if (result.score >= FINDING_SCORE_THRESHOLD) {
      findings.push({
        username: candidate.username,
        platform,
        profileUrl: candidate.profileUrl,
        score: result.score,
        riskLevel: result.riskLevel,
        status: result.status,
        reasons: result.reasons,
        limitations: result.limitations,
        matchedReference: result.matchedReference || '',
      });
    }
  }

  return { platform, scannedCount: candidates.length, officialMatchCount: officialMatches.length, findings };
}

function scanAllPlatforms(brand, { platforms = PLATFORMS } = {}) {
  const results = platforms.map((p) => scanPlatform(brand, p));
  const allFindings = results.flatMap((r) => r.findings);
  const totalScanned = results.reduce((s, r) => s + r.scannedCount, 0);
  const totalOfficialMatches = results.reduce((s, r) => s + r.officialMatchCount, 0);

  return {
    source: 'Social Platform Monitor (Simulated)',
    platforms,
    totalScanned,
    officialMatchCount: totalOfficialMatches,
    findings: allFindings.sort((a, b) => b.score - a.score),
    platformBreakdown: results.map((r) => ({
      platform: r.platform,
      scannedCount: r.scannedCount,
      findingCount: r.findings.length,
      officialMatchCount: r.officialMatchCount,
    })),
    scannedAt: new Date(),
  };
}

module.exports = { scanAllPlatforms, PLATFORMS };
