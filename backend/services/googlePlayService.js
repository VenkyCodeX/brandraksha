'use strict';

// Simulated Google Play monitoring service.
// No live Google Play API is used. Results are generated deterministically
// from the brand profile and clearly labelled as simulated data.
// This demonstrates the monitoring workflow for Android apps.

const FINDING_SCORE_THRESHOLD = 20;

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(left, right) {
  const prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let l = 1; l <= left.length; l += 1) {
    let diag = prev[0];
    prev[0] = l;
    for (let r = 1; r <= right.length; r += 1) {
      const above = prev[r];
      prev[r] = Math.min(prev[r] + 1, prev[r - 1] + 1, diag + (left[l - 1] === right[r - 1] ? 0 : 1));
      diag = above;
    }
  }
  return prev[right.length];
}

function similarity(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  return Math.max(0, 1 - levenshteinDistance(na, nb) / Math.max(na.length, nb.length));
}

function getRiskLevel(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

// Deterministic fixture templates — varied enough to produce different risk levels.
// Fixture 1 is always the registered official Android app (or a constructed stand-in when
// no Android app is registered). It is excluded via isOfficialMatch only when the brand
// has a matching officialApps entry; otherwise it scores as a low-risk finding so the
// workflow still demonstrates the exclusion path when real data is present.
function buildFixtures(brand) {
  const name = brand.brandName || 'Brand';
  const norm = normalizeText(name);
  const androidApp = brand.officialApps?.find((a) => a.platform === 'Android');
  // Use the registered package ID and publisher so isOfficialMatch can exclude it.
  const officialPkg = androidApp?.packageId || `com.${norm}.app`;
  const officialPub = androidApp?.publisher || name;

  return [
    {
      trackId: `sim-gp-1-${norm}`,
      appName: androidApp?.appName || `${name} - Official App`,
      bundleId: officialPkg,
      publisher: officialPub,
      sellerName: officialPub,
      description: `The official ${name} application.`,
      iconUrl: brand.logoUrl || '',
      storeUrl: `https://play.google.com/store/search?q=${encodeURIComponent(name)}&c=apps`,
      _simulated: true,
    },
    {
      trackId: `sim-gp-2-${norm}`,
      appName: `${name} Support`,
      bundleId: `com.${norm}.support`,
      publisher: `${name} Help Desk`,
      sellerName: `${name} Help Desk`,
      description: `Get help and support for your ${name} account. Contact our team 24/7.`,
      iconUrl: '',
      storeUrl: `https://play.google.com/store/search?q=${encodeURIComponent(name + ' support')}&c=apps`,
      _simulated: true,
    },
    {
      trackId: `sim-gp-3-${norm}`,
      appName: `${name}Pro`,
      bundleId: `com.${norm}pro.unofficial`,
      publisher: 'Third Party Dev',
      sellerName: 'Third Party Dev',
      description: `Unofficial companion app for ${name} users. Not affiliated with ${name}.`,
      iconUrl: '',
      storeUrl: `https://play.google.com/store/search?q=${encodeURIComponent(name + 'pro')}&c=apps`,
      _simulated: true,
    },
    {
      trackId: `sim-gp-4-${norm}`,
      appName: `${name.slice(0, 4)}${norm.slice(-2)} Mobile`,
      bundleId: `com.fake${norm}.mobile`,
      publisher: 'Mobile Apps Studio',
      sellerName: 'Mobile Apps Studio',
      description: `Fast and easy access to ${name} services on your Android device.`,
      iconUrl: '',
      storeUrl: `https://play.google.com/store/search?q=${encodeURIComponent(name)}&c=apps`,
      _simulated: true,
    },
    {
      trackId: `sim-gp-5-${norm}`,
      appName: 'Unrelated Finance Tracker',
      bundleId: 'com.generic.financetracker',
      publisher: 'Generic Apps Inc',
      sellerName: 'Generic Apps Inc',
      description: 'Track your personal finances and budgets.',
      iconUrl: '',
      storeUrl: 'https://play.google.com/store/search?q=finance+tracker&c=apps',
      _simulated: true,
    },
  ];
}

function isOfficialMatch(candidate, brand) {
  const officialApps = Array.isArray(brand.officialApps) ? brand.officialApps : [];
  return officialApps.some((app) => {
    // Primary: package ID match (requires both sides non-empty)
    const pkg = normalizeText(app.packageId);
    const cPkg = normalizeText(candidate.bundleId);
    if (pkg && cPkg && pkg === cPkg) return true;
    // Fallback: exact app name AND publisher match (both required)
    const appName = normalizeText(app.appName);
    const pub = normalizeText(app.publisher);
    const cName = normalizeText(candidate.appName);
    const cPub = normalizeText(candidate.publisher);
    return Boolean(appName && pub && cName && cPub && appName === cName && pub === cPub);
  });
}

function assessCandidate(candidate, brand) {
  const references = [
    { matchName: brand.brandName },
    ...(brand.officialApps || []).map((a) => ({ matchName: a.appName, packageId: a.packageId, publisher: a.publisher })),
  ];

  const closest = references.reduce((best, ref) => {
    const s = similarity(candidate.appName, ref.matchName);
    return !best || s > best.sim ? { ref, sim: s } : best;
  }, null);

  const nameSim = closest?.sim || 0;
  let score = 0;
  const reasons = [];

  if (nameSim >= 0.9) { score += 40; reasons.push(`App name closely matches "${closest.ref.matchName}".`); }
  else if (nameSim >= 0.75) { score += 30; reasons.push(`App name is ${Math.round(nameSim * 100)}% similar to "${closest.ref.matchName}".`); }
  else if (nameSim >= 0.6) { score += 20; reasons.push(`App name is ${Math.round(nameSim * 100)}% similar to "${closest.ref.matchName}".`); }
  else if (nameSim >= 0.45) { score += 10; reasons.push(`App name has some similarity to "${closest.ref.matchName}".`); }

  if (closest?.ref.packageId && nameSim >= 0.75) {
    const regPkg = normalizeText(closest.ref.packageId);
    const cPkg = normalizeText(candidate.bundleId);
    if (regPkg && cPkg && regPkg !== cPkg) {
      score += 25;
      reasons.push('Package ID differs from the registered app with a similar name.');
    }
    const regPub = normalizeText(closest.ref.publisher);
    const cPub = normalizeText(candidate.publisher);
    if (regPub && cPub && regPub !== cPub) {
      score += 20;
      reasons.push(`Publisher differs from the registered app (${candidate.publisher}).`);
    }
  }

  const normBrand = normalizeText(brand.brandName);
  const normDesc = normalizeText(candidate.description);
  if (nameSim >= 0.6 && normBrand.length >= 4 && normDesc.includes(normBrand)) {
    score += 10;
    reasons.push('App description mentions the registered brand name.');
  }

  score = Math.min(100, score);
  return {
    officialMatch: false,
    matchedReferenceName: closest?.ref.matchName || brand.brandName,
    nameSimilarity: Math.round(nameSim * 100),
    score,
    riskLevel: getRiskLevel(score),
    status: 'NEEDS_REVIEW',
    reasons: reasons.length ? reasons : ['No strong name, publisher, or identifier signal was detected.'],
    finding: score >= FINDING_SCORE_THRESHOLD,
  };
}

function searchGooglePlay(brand, { countryCode = 'US' } = {}) {
  const queryTerms = [...new Set([
    brand.brandName,
    ...(brand.officialApps || []).map((a) => a.appName),
  ].map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean))].slice(0, 5);

  const candidates = buildFixtures(brand);
  const officialMatches = [];
  const findings = [];

  for (const candidate of candidates) {
    if (isOfficialMatch(candidate, brand)) {
      officialMatches.push({ trackId: candidate.trackId, appName: candidate.appName, bundleId: candidate.bundleId });
      continue;
    }
    const assessment = assessCandidate(candidate, brand);
    if (assessment.finding) {
      const { _simulated, ...rest } = candidate;
      findings.push({ ...rest, ...assessment, queryTerm: undefined, matchedSearchTerms: [brand.brandName] });
    }
  }

  return {
    source: 'Google Play (Simulated)',
    countryCode: countryCode.toUpperCase(),
    queryTerms,
    scannedAppCount: candidates.length,
    officialMatchCount: officialMatches.length,
    findings,
    scannedAt: new Date(),
  };
}

module.exports = { searchGooglePlay };
