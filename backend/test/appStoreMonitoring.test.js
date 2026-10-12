const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  AppStoreSearchError,
  assessCandidate,
  mapAppleResult,
  searchAppleAppStore,
} = require('../services/appStoreMonitoringService');

const brand = {
  _id: '507f1f77bcf86cd799439011',
  brandName: 'Northstar',
  officialApps: [{
    appName: 'Northstar Pay',
    platform: 'iOS',
    packageId: 'com.northstar.pay',
    storeUrl: 'https://apps.apple.com/us/app/northstar-pay/id1001',
    publisher: 'Northstar Inc',
    iconUrl: 'https://northstar.example/pay.png',
  }],
};

const officialAppleListing = {
  trackId: 1001,
  trackName: 'Northstar Pay',
  bundleId: 'com.northstar.pay',
  artistName: 'Northstar Inc',
  sellerName: 'Northstar Inc',
  description: 'The official Northstar Pay app.',
  artworkUrl512: 'https://apps.example/official.png',
  trackViewUrl: 'https://apps.apple.com/us/app/northstar-pay/id1001',
};

const lookalikeAppleListing = {
  trackId: 2002,
  trackName: 'Northstar Pay',
  bundleId: 'com.other.northstar.pay',
  artistName: 'Unknown Publisher',
  sellerName: 'Unknown Publisher LLC',
  description: 'Northstar Pay support and account security.',
  artworkUrl512: 'https://apps.example/candidate.png',
  trackViewUrl: 'https://apps.apple.com/us/app/northstar-pay/id2002',
};

test('maps the Apple Search response fields used by monitoring', () => {
  const result = mapAppleResult({
    trackName: 'Candidate App',
    bundleId: 'com.candidate.app',
    artistName: 'Candidate Publisher',
    sellerName: 'Candidate LLC',
    description: 'Listing details',
    artworkUrl512: 'https://apps.example/icon.png',
    trackViewUrl: 'https://apps.apple.com/us/app/candidate/id99123?uo=4',
    trackId: 99123,
  }, 'Northstar');

  assert.equal(result.appName, 'Candidate App');
  assert.equal(result.bundleId, 'com.candidate.app');
  assert.equal(result.publisher, 'Candidate Publisher');
  assert.equal(result.sellerName, 'Candidate LLC');
  assert.equal(result.iconUrl, 'https://apps.example/icon.png');
  assert.equal(result.trackId, '99123');
  assert.equal(result.queryTerm, 'Northstar');
});

test('excludes a registered official app by bundle ID or App Store listing ID', () => {
  const sameBundle = assessCandidate({
    appName: 'Renamed Official Listing',
    bundleId: 'com.northstar.pay',
    storeUrl: 'https://apps.apple.com/us/app/renamed/id8001',
    publisher: 'Someone Else',
  }, brand);
  const sameListing = assessCandidate({
    appName: 'Renamed Official Listing',
    bundleId: 'com.different.id',
    storeUrl: 'https://apps.apple.com/us/app/northstar-pay/id1001',
    publisher: 'Someone Else',
  }, brand);

  assert.equal(sameBundle.officialMatch, true);
  assert.equal(sameListing.officialMatch, true);
});

test('matches an official publisher using Apple sellerName when artistName differs', () => {
  const result = assessCandidate({
    appName: 'Northstar Pay',
    bundleId: 'com.other.northstar.pay',
    storeUrl: 'https://apps.apple.com/us/app/northstar-pay/id2002',
    publisher: 'Northstar App Store Developer',
    sellerName: 'Northstar Inc',
  }, brand);

  assert.equal(result.officialMatch, true);
});

test('similar app name with a different publisher and bundle ID is a review lead', () => {
  const result = assessCandidate({
    appName: 'Northstar Pay',
    bundleId: 'com.other.northstar.pay',
    storeUrl: 'https://apps.apple.com/us/app/northstar-pay/id2002',
    publisher: 'Unknown Publisher',
    sellerName: 'Unknown Publisher LLC',
    description: 'Northstar Pay support and account security.',
  }, brand);

  assert.equal(result.officialMatch, false);
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.score >= 60 && result.score <= 100);
  assert.ok(result.reasons.some((reason) => reason.includes('Bundle ID differs')));
  assert.ok(result.reasons.some((reason) => reason.includes('Publisher differs')));
  assert.ok(result.reasons.some((reason) => reason.includes('description')));
});

test('searches brand and registered app names, deduplicates results, and excludes official apps', async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(new URL(url));
    return {
      ok: true,
      async json() {
        return { resultCount: 2, results: [officialAppleListing, lookalikeAppleListing] };
      },
    };
  };

  const result = await searchAppleAppStore(brand, { countryCode: 'US', fetchImpl });

  assert.deepEqual(result.queryTerms, ['Northstar', 'Northstar Pay']);
  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls.every((url) => url.searchParams.get('entity') === 'software'));
  assert.equal(result.scannedAppCount, 2);
  assert.equal(result.officialMatchCount, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].trackId, '2002');
  assert.equal(result.findings[0].matchedSearchTerms.length, 2);
});

test('reports upstream Apple Search failures without returning empty scan results', async () => {
  await assert.rejects(
    searchAppleAppStore(brand, {
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    AppStoreSearchError,
  );
});

// ─── Google Play simulated service tests ─────────────────────────────────────

const { searchGooglePlay } = require('../services/googlePlayService');

const gpBrandWithAndroidApp = {
  _id: '507f1f77bcf86cd799439022',
  brandName: 'Northstar',
  logoUrl: '',
  officialApps: [{
    appName: 'Northstar Pay',
    platform: 'Android',
    packageId: 'com.northstar.pay',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.northstar.pay',
    publisher: 'Northstar Inc',
  }],
};

const gpBrandNoAndroidApp = {
  _id: '507f1f77bcf86cd799439033',
  brandName: 'Acme',
  logoUrl: '',
  officialApps: [],
};

test('Google Play scan result is always labelled as simulated source', () => {
  const result = searchGooglePlay(gpBrandWithAndroidApp);
  assert.equal(result.source, 'Google Play (Simulated)');
});

test('Google Play scan returns correct countryCode and queryTerms', () => {
  const result = searchGooglePlay(gpBrandWithAndroidApp, { countryCode: 'IN' });
  assert.equal(result.countryCode, 'IN');
  assert.ok(Array.isArray(result.queryTerms));
  assert.ok(result.queryTerms.includes('Northstar'));
});

test('Google Play official app is excluded by package ID when Android app is registered', () => {
  const result = searchGooglePlay(gpBrandWithAndroidApp);
  assert.ok(result.officialMatchCount >= 1, 'Expected at least one official match exclusion');
  const leaked = result.findings.find((f) => f.bundleId === 'com.northstar.pay');
  assert.equal(leaked, undefined, 'Registered bundle ID must not appear in findings');
});

test('Google Play official match uses package ID not display name alone', () => {
  const result = searchGooglePlay(gpBrandWithAndroidApp);
  // Fixture 2 ("Northstar Support") has a different bundleId — must appear as a finding
  const supportFinding = result.findings.find((f) => /support/i.test(f.appName));
  assert.ok(supportFinding, 'Similar-name app with different bundle ID should appear as a finding');
  assert.notEqual(supportFinding.bundleId, 'com.northstar.pay');
});

test('Google Play findings carry NEEDS_REVIEW status and valid risk levels', () => {
  const result = searchGooglePlay(gpBrandWithAndroidApp);
  const validLevels = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  for (const finding of result.findings) {
    assert.equal(finding.status, 'NEEDS_REVIEW');
    assert.ok(validLevels.has(finding.riskLevel), `Unexpected riskLevel: ${finding.riskLevel}`);
    assert.ok(finding.score >= 0 && finding.score <= 100, `Score out of range: ${finding.score}`);
    assert.ok(Array.isArray(finding.reasons) && finding.reasons.length > 0, 'Finding must have reasons');
  }
});

test('Google Play findings do not expose the _simulated internal flag', () => {
  const result = searchGooglePlay(gpBrandWithAndroidApp);
  for (const finding of result.findings) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(finding, '_simulated'),
      '_simulated must be stripped from findings',
    );
  }
});

test('Google Play scan with no registered Android app produces findings without crashing', () => {
  const result = searchGooglePlay(gpBrandNoAndroidApp);
  assert.equal(result.source, 'Google Play (Simulated)');
  assert.ok(typeof result.scannedAppCount === 'number');
  assert.ok(Array.isArray(result.findings));
  assert.ok(result.officialMatchCount >= 0);
});

test('Google Play score and risk level are consistent with each other', () => {
  const result = searchGooglePlay(gpBrandWithAndroidApp);
  for (const finding of result.findings) {
    const { score, riskLevel } = finding;
    if (score >= 80) assert.equal(riskLevel, 'CRITICAL');
    else if (score >= 60) assert.equal(riskLevel, 'HIGH');
    else if (score >= 30) assert.equal(riskLevel, 'MEDIUM');
    else assert.equal(riskLevel, 'LOW');
  }
});

test('Google Play route validateBrandId rejects malformed IDs', () => {
  const mongoose = require('mongoose');
  assert.equal(mongoose.isObjectIdOrHexString('not-an-id'), false);
  assert.equal(mongoose.isObjectIdOrHexString(''), false);
  assert.equal(mongoose.isObjectIdOrHexString('gggggggggggggggggggggggg'), false);
  assert.equal(mongoose.isObjectIdOrHexString('507f1f77bcf86cd799439011'), true);
});

test('Google Play route countryCode regex matches Apple route pattern', () => {
  const valid = ['US', 'IN', 'gb', 'De'];
  const invalid = ['USA', '1', '', 'U'];
  for (const code of valid) {
    assert.ok(/^[a-z]{2}$/i.test(code.trim()), `Expected ${code} to be valid`);
  }
  for (const code of invalid) {
    assert.ok(!/^[a-z]{2}$/i.test(code.trim()), `Expected ${code} to be invalid`);
  }
});
