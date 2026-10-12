const APPLE_SEARCH_URL = 'https://itunes.apple.com/search';
const SEARCH_TERM_LIMIT = 5;
const RESULT_LIMIT = 50;
const FINDING_SCORE_THRESHOLD = 20;

class AppStoreSearchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppStoreSearchError';
  }
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + substitutionCost,
      );
      diagonal = above;
    }
  }

  return previous[right.length];
}

function similarity(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  return Math.max(0, 1 - levenshteinDistance(normalizedLeft, normalizedRight) / Math.max(normalizedLeft.length, normalizedRight.length));
}

function getTrackId(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    const queryId = parsed.searchParams.get('id');
    if (queryId) return queryId;
    return parsed.pathname.match(/\/id(\d+)/i)?.[1] || '';
  } catch {
    return url.match(/(?:id=|\/id)(\d+)/i)?.[1] || '';
  }
}

function getCandidatePublishers(candidate) {
  return [...new Set([candidate.publisher, candidate.sellerName]
    .map(normalizeText)
    .filter(Boolean))];
}

function mapAppleResult(result, queryTerm) {
  return {
    trackId: result.trackId ? String(result.trackId) : getTrackId(result.trackViewUrl),
    appName: typeof result.trackName === 'string' ? result.trackName : '',
    bundleId: typeof result.bundleId === 'string' ? result.bundleId : '',
    publisher: typeof result.artistName === 'string' ? result.artistName : '',
    sellerName: typeof result.sellerName === 'string' ? result.sellerName : '',
    description: typeof result.description === 'string' ? result.description : '',
    iconUrl: typeof result.artworkUrl512 === 'string'
      ? result.artworkUrl512
      : typeof result.artworkUrl100 === 'string'
        ? result.artworkUrl100
        : '',
    storeUrl: typeof result.trackViewUrl === 'string' ? result.trackViewUrl : '',
    queryTerm,
  };
}

function registeredAppMatches(candidate, officialApp) {
  const candidateBundleId = normalizeText(candidate.bundleId);
  const officialBundleId = normalizeText(officialApp.packageId);
  if (candidateBundleId && officialBundleId && candidateBundleId === officialBundleId) return true;

  const candidateTrackId = getTrackId(candidate.storeUrl);
  const officialTrackId = getTrackId(officialApp.storeUrl);
  if (candidateTrackId && officialTrackId && candidateTrackId === officialTrackId) return true;

  const officialName = normalizeText(officialApp.appName);
  const officialPublisher = normalizeText(officialApp.publisher);
  const candidatePublishers = getCandidatePublishers(candidate);
  return Boolean(
    officialName && officialPublisher &&
    officialName === normalizeText(candidate.appName) &&
    candidatePublishers.includes(officialPublisher),
  );
}

function getRiskLevel(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

function assessCandidate(candidate, brand) {
  const officialApps = Array.isArray(brand.officialApps) ? brand.officialApps : [];
  const exactOfficialApp = officialApps.find((officialApp) => registeredAppMatches(candidate, officialApp));
  if (exactOfficialApp) {
    return { officialMatch: true, matchedOfficialAppName: exactOfficialApp.appName };
  }

  const references = [
    { name: brand.brandName, publisher: '', packageId: '', storeUrl: '' },
    ...officialApps,
  ].filter((reference) => typeof reference.name === 'string' || typeof reference.appName === 'string')
    .map((reference) => ({
      ...reference,
      matchName: reference.appName || reference.name,
    }));

  const closest = references.reduce((best, reference) => {
    const score = similarity(candidate.appName, reference.matchName);
    return !best || score > best.similarity ? { reference, similarity: score } : best;
  }, null);
  const nameSimilarity = closest?.similarity || 0;
  let score = 0;
  const reasons = [];

  if (nameSimilarity >= 0.9) {
    score += 40;
    reasons.push(`App name closely matches the brand reference “${closest.reference.matchName}”.`);
  } else if (nameSimilarity >= 0.75) {
    score += 30;
    reasons.push(`App name is ${Math.round(nameSimilarity * 100)}% similar to “${closest.reference.matchName}”.`);
  } else if (nameSimilarity >= 0.6) {
    score += 20;
    reasons.push(`App name is ${Math.round(nameSimilarity * 100)}% similar to “${closest.reference.matchName}”.`);
  } else if (nameSimilarity >= 0.45) {
    score += 10;
    reasons.push(`App name has some similarity to “${closest.reference.matchName}”.`);
  }

  if (closest?.reference.appName && nameSimilarity >= 0.75) {
    const registeredBundleId = normalizeText(closest.reference.packageId);
    const candidateBundleId = normalizeText(candidate.bundleId);
    if (registeredBundleId && candidateBundleId && registeredBundleId !== candidateBundleId) {
      score += 25;
      reasons.push('Bundle ID differs from the registered app with a similar name.');
    }

    const registeredPublisher = normalizeText(closest.reference.publisher);
    const candidatePublishers = getCandidatePublishers(candidate);
    if (registeredPublisher && candidatePublishers.length && !candidatePublishers.includes(registeredPublisher)) {
      score += 20;
      reasons.push(`Publisher differs from the registered app (${candidate.publisher || candidate.sellerName}).`);
    }
  }

  const normalizedBrandName = normalizeText(brand.brandName);
  const normalizedDescription = normalizeText(candidate.description);
  if (nameSimilarity >= 0.6 && normalizedBrandName.length >= 4 && normalizedDescription.includes(normalizedBrandName)) {
    score += 10;
    reasons.push('App description mentions the registered brand name.');
  }

  score = Math.min(100, score);
  return {
    officialMatch: false,
    matchedReferenceName: closest?.reference.matchName || brand.brandName,
    nameSimilarity: Math.round(nameSimilarity * 100),
    score,
    riskLevel: getRiskLevel(score),
    status: 'NEEDS_REVIEW',
    reasons: reasons.length ? reasons : ['No strong name, publisher, or identifier signal was detected.'],
    finding: score >= FINDING_SCORE_THRESHOLD,
  };
}

function deduplicateResults(results) {
  const unique = new Map();
  for (const result of results) {
    const key = result.trackId || `${normalizeText(result.appName)}:${normalizeText(result.bundleId)}:${normalizeText(result.publisher)}`;
    if (!key || unique.has(key)) continue;
    unique.set(key, result);
  }
  return [...unique.values()];
}

async function searchAppleAppStore(brand, { countryCode = 'US', fetchImpl = fetch } = {}) {
  const queryTerms = [...new Set([
    brand.brandName,
    ...(Array.isArray(brand.officialApps) ? brand.officialApps.map((app) => app.appName) : []),
  ].map((term) => typeof term === 'string' ? term.trim() : '').filter(Boolean))]
    .slice(0, SEARCH_TERM_LIMIT);

  if (!queryTerms.length) {
    throw new AppStoreSearchError('Brand profile has no name or app names to search.');
  }

  const responses = await Promise.all(queryTerms.map(async (queryTerm) => {
    const url = new URL(APPLE_SEARCH_URL);
    url.searchParams.set('term', queryTerm);
    url.searchParams.set('entity', 'software');
    url.searchParams.set('country', countryCode.toLowerCase());
    url.searchParams.set('limit', String(RESULT_LIMIT));

    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new AppStoreSearchError(`Apple Search API returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.results)) {
      throw new AppStoreSearchError('Apple Search API returned an unexpected response.');
    }
    return { queryTerm, results: payload.results.map((result) => mapAppleResult(result, queryTerm)) };
  }));

  const candidates = deduplicateResults(responses.flatMap((response) => response.results));
  const officialMatches = [];
  const findings = [];

  for (const candidate of candidates) {
    const assessment = assessCandidate(candidate, brand);
    if (assessment.officialMatch) {
      officialMatches.push({
        trackId: candidate.trackId,
        appName: candidate.appName,
        bundleId: candidate.bundleId,
        matchedOfficialAppName: assessment.matchedOfficialAppName,
      });
      continue;
    }
    if (assessment.finding) {
      findings.push({
        ...candidate,
        ...assessment,
        queryTerm: undefined,
        matchedSearchTerms: [...new Set(responses
          .filter((response) => response.results.some((result) => result.trackId === candidate.trackId))
          .map((response) => response.queryTerm))],
      });
    }
  }

  return {
    source: 'Apple App Store Search API',
    countryCode: countryCode.toUpperCase(),
    queryTerms,
    scannedAppCount: candidates.length,
    officialMatchCount: officialMatches.length,
    findings,
    scannedAt: new Date(),
  };
}

module.exports = {
  AppStoreSearchError,
  assessCandidate,
  mapAppleResult,
  normalizeText,
  searchAppleAppStore,
};