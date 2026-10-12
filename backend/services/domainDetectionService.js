const net = require('node:net');

const ADDED_WORDS = ['account', 'help', 'login', 'offers', 'secure', 'support', 'verify'];
const LOOKALIKE_CHARACTERS = { '0': ['o'], 'o': ['0'], '1': ['l', 'i'], l: ['1'], i: ['1'] };
const SCORE_RULES = [
  { minimum: 0.95, points: 60 },
  { minimum: 0.85, points: 45 },
  { minimum: 0.75, points: 30 },
  { minimum: 0.65, points: 20 },
  { minimum: 0.55, points: 10 },
];
const BRAND_NAME_IN_HOSTNAME_POINTS = 25;
const ADDED_WORD_POINTS = 15;
const BRAND_NAME_MIN_LENGTH = 4;

class DomainAnalysisInputError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'DomainAnalysisInputError';
    this.field = field;
  }
}

function parseHostname(value, { requireProtocol = false, domainOnly = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DomainAnalysisInputError('A domain or URL is required.', 'candidateUrl');
  }

  const trimmed = value.trim();
  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  if (requireProtocol && !hasProtocol) {
    throw new DomainAnalysisInputError('Candidate URL must start with http:// or https://.', 'candidateUrl');
  }

  let url;
  try {
    url = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
  } catch {
    throw new DomainAnalysisInputError('Enter a valid domain or URL.', 'candidateUrl');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new DomainAnalysisInputError('Only http and https URLs are supported.', 'candidateUrl');
  }
  if (url.username || url.password) {
    throw new DomainAnalysisInputError('URLs containing embedded credentials are not supported.', 'candidateUrl');
  }
  if (domainOnly && (url.port || url.pathname !== '/' || url.search || url.hash)) {
    throw new DomainAnalysisInputError('Enter a hostname only, without a port, path, query, or fragment.', 'officialDomains');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || net.isIP(hostname)) {
    throw new DomainAnalysisInputError('Enter a public DNS hostname, not a local name or IP address.', domainOnly ? 'officialDomains' : 'candidateUrl');
  }
  if (!hostname.includes('.')) {
    throw new DomainAnalysisInputError('A fully qualified public domain is required.', domainOnly ? 'officialDomains' : 'candidateUrl');
  }

  return hostname;
}

function normalizeOfficialDomain(value) {
  return parseHostname(value, { domainOnly: true });
}

function parseCandidateUrl(value) {
  const hostname = parseHostname(value, { requireProtocol: true });
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new DomainAnalysisInputError('Enter a valid http or https URL.', 'candidateUrl');
  }

  return { hostname, url: parsed.toString() };
}

function equivalentCharacters(left, right) {
  return left === right || (LOOKALIKE_CHARACTERS[left] || []).includes(right);
}

function damerauLevenshteinDistance(left, right) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const distance = Array.from({ length: rows }, () => Array(columns).fill(0));

  for (let row = 0; row < rows; row += 1) distance[row][0] = row;
  for (let column = 0; column < columns; column += 1) distance[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = equivalentCharacters(left[row - 1], right[column - 1]) ? 0 : 1;
      distance[row][column] = Math.min(
        distance[row - 1][column] + 1,
        distance[row][column - 1] + 1,
        distance[row - 1][column - 1] + cost,
      );

      if (row > 1 && column > 1 &&
          equivalentCharacters(left[row - 1], right[column - 2]) &&
          equivalentCharacters(left[row - 2], right[column - 1])) {
        distance[row][column] = Math.min(distance[row][column], distance[row - 2][column - 2] + cost);
      }
    }
  }

  return distance[left.length][right.length];
}

function similarityRatio(candidateHostname, officialHostname) {
  const length = Math.max(candidateHostname.length, officialHostname.length);
  if (!length) return 0;
  return Math.max(0, 1 - damerauLevenshteinDistance(candidateHostname, officialHostname) / length);
}

function isTldOnlyDifference(candidateHostname, officialHostname) {
  const candidateLabels = candidateHostname.split('.');
  const officialLabels = officialHostname.split('.');
  if (candidateLabels.length !== officialLabels.length || candidateLabels.length < 2) return false;
  return candidateLabels.slice(0, -1).every((label, index) => label === officialLabels[index]) &&
    candidateLabels.at(-1) !== officialLabels.at(-1);
}

function getAddedWords(candidateHostname, officialHostname) {
  const candidateWords = new Set(candidateHostname.split(/[.-]/));
  const officialWords = new Set(officialHostname.split(/[.-]/));
  return ADDED_WORDS.filter((word) => candidateWords.has(word) && !officialWords.has(word));
}

// Returns the last two dot-separated labels of a hostname (registrable domain approximation).
function registrableDomain(hostname) {
  const labels = hostname.split('.');
  return labels.slice(-2).join('.');
}

// Normalizes a brand name to lowercase alphanumeric for hostname label matching.
function normalizeBrandName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hasBrandNameInHostname(candidateHostname, brandName) {
  if (!brandName || brandName.length < BRAND_NAME_MIN_LENGTH) return false;
  const normalized = normalizeBrandName(brandName);
  if (normalized.length < BRAND_NAME_MIN_LENGTH) return false;
  // Check each label of the candidate hostname for the brand name as a substring.
  return candidateHostname.split(/[.-]/).some((label) => label.includes(normalized));
}

function riskLevelForScore(score) {
  if (score >= 75) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

function analyzeCandidateDomain({ candidateUrl, officialDomains, brandName = '' }) {
  const parsedCandidate = parseCandidateUrl(candidateUrl);
  if (!Array.isArray(officialDomains)) {
    throw new DomainAnalysisInputError('Official domains must be an array.', 'officialDomains');
  }

  const references = [...new Set(officialDomains.map(normalizeOfficialDomain))];
  if (!references.length) {
    throw new DomainAnalysisInputError('No official domain reference is available for this brand.', 'officialDomains');
  }

  const exactOrSubdomainMatch = references.find((officialDomain) =>
    parsedCandidate.hostname === officialDomain || parsedCandidate.hostname.endsWith(`.${officialDomain}`),
  );
  if (exactOrSubdomainMatch) {
    return {
      candidateUrl: parsedCandidate.url,
      candidateHostname: parsedCandidate.hostname,
      officialDomain: exactOrSubdomainMatch,
      score: 0,
      riskLevel: 'LOW',
      status: 'OFFICIAL_MATCH',
      similarity: 100,
      signals: [{ type: 'official_domain_match', points: 0, detail: 'Candidate hostname is the registered official domain or one of its subdomains.' }],
      reasons: ['Candidate matches the registered official domain. It is not suspicious based on domain comparison alone.'],
      limitations: ['This is a domain-name comparison only; no website content or ownership was checked.'],
    };
  }

  const bestMatch = references.map((officialDomain) => ({
    officialDomain,
    similarity: similarityRatio(parsedCandidate.hostname, officialDomain),
  })).reduce((best, comparison) => comparison.similarity > best.similarity ? comparison : best);

  if (isTldOnlyDifference(parsedCandidate.hostname, bestMatch.officialDomain)) {
    return {
      candidateUrl: parsedCandidate.url,
      candidateHostname: parsedCandidate.hostname,
      officialDomain: bestMatch.officialDomain,
      score: 0,
      riskLevel: 'LOW',
      status: 'NEEDS_REVIEW',
      similarity: Math.round(bestMatch.similarity * 100),
      signals: [{ type: 'tld_difference_only', points: 0, detail: 'Only the final domain label differs; a different TLD alone is not evidence of impersonation.' }],
      reasons: ['The hostname label is unchanged and only its TLD differs. Different TLDs alone are not treated as suspicious.'],
      limitations: ['This is a domain-name comparison only; no website content, registration data, or ownership was checked.'],
    };
  }

  // Also compare just the registrable domain portion (eTLD+1 approximation) for subdomain-padded candidates.
  const candidateRD = registrableDomain(parsedCandidate.hostname);
  const bestRDMatch = references.map((officialDomain) => ({
    officialDomain,
    similarity: similarityRatio(candidateRD, registrableDomain(officialDomain)),
  })).reduce((best, comparison) => comparison.similarity > best.similarity ? comparison : best);
  const effectiveSimilarity = Math.max(bestMatch.similarity, bestRDMatch.similarity);

  const similarityPoints = SCORE_RULES.find((rule) => effectiveSimilarity >= rule.minimum)?.points || 0;
  const addedWords = getAddedWords(parsedCandidate.hostname, bestMatch.officialDomain);
  const addedWordPoints = addedWords.length && effectiveSimilarity >= 0.55 ? ADDED_WORD_POINTS : 0;
  const brandNamePoints = hasBrandNameInHostname(parsedCandidate.hostname, brandName) ? BRAND_NAME_IN_HOSTNAME_POINTS : 0;
  const score = Math.min(100, similarityPoints + addedWordPoints + brandNamePoints);
  const signals = [];

  if (similarityPoints) {
    signals.push({
      type: 'hostname_similarity',
      points: similarityPoints,
      detail: `Candidate hostname is ${Math.round(effectiveSimilarity * 100)}% similar to ${bestMatch.officialDomain} using Damerau-Levenshtein distance.`,
    });
  }
  if (addedWordPoints) {
    signals.push({
      type: 'added_brand_related_word',
      points: addedWordPoints,
      detail: `Candidate contains additional word${addedWords.length > 1 ? 's' : ''}: ${addedWords.join(', ')}.`,
    });
  }
  if (brandNamePoints) {
    signals.push({
      type: 'brand_name_in_hostname',
      points: brandNamePoints,
      detail: `Candidate hostname contains the brand name as a label, which is a common impersonation pattern.`,
    });
  }
  if (!signals.length) {
    signals.push({
      type: 'no_strong_similarity',
      points: 0,
      detail: 'No configured hostname similarity threshold was reached.',
    });
  }

  return {
    candidateUrl: parsedCandidate.url,
    candidateHostname: parsedCandidate.hostname,
    officialDomain: bestMatch.officialDomain,
    score,
    riskLevel: riskLevelForScore(score),
    status: 'NEEDS_REVIEW',
    similarity: Math.round(bestMatch.similarity * 100),
    signals,
    reasons: signals.map((signal) => signal.detail),
    limitations: [
      'This is a deterministic domain-name heuristic, not proof of fraud or common ownership.',
      'No website content, logo, DNS, certificate, or registration data was fetched or analyzed.',
      'A low score does not establish that the candidate domain is safe.',
    ],
  };
}

module.exports = {
  DomainAnalysisInputError,
  analyzeCandidateDomain,
  damerauLevenshteinDistance,
  normalizeOfficialDomain,
  parseCandidateUrl,
};