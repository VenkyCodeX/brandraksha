<<<<<<< HEAD
const SOCIAL_PLATFORMS = ['Instagram', 'Facebook', 'X', 'LinkedIn', 'YouTube', 'Other'];
const ROLE_WORDS = ['support', 'help', 'security', 'verify', 'official'];
const LOOKALIKE_CHARACTERS = { '0': ['o'], 'o': ['0'], '1': ['l', 'i'], l: ['1'], i: ['1'] };
const SCORING_RULES = {
  similarity: [
    { minimum: 0.95, points: 50 },
    { minimum: 0.85, points: 45 },
    { minimum: 0.75, points: 35 },
    { minimum: 0.6, points: 25 },
    { minimum: 0.5, points: 15 },
  ],
  roleWordMatchRatio: 0.9,
  paymentRequested: 30,
  credentialRequested: 40,
  thresholds: { medium: 30, high: 60, critical: 80 },
};
const LIMITATIONS = [
  'This is a deterministic heuristic assessment, not proof of fraud or account ownership.',
  'A low score does not mean the account is safe; review the candidate and supporting evidence manually.',
];

class SocialDetectionInputError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'SocialDetectionInputError';
    this.field = field;
  }
}

function normalizeUsername(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^@+/, '').toLowerCase().replace(/[\s._-]/g, '');
}

function areEquivalentCharacters(left, right) {
  return left === right || (LOOKALIKE_CHARACTERS[left] || []).includes(right);
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const substitutionCost = areEquivalentCharacters(left[leftIndex - 1], right[rightIndex - 1]) ? 0 : 1;
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

function similarityRatio(left, right) {
  if (!left || !right) return 0;
  const length = Math.max(left.length, right.length);
  return Math.max(0, 1 - levenshteinDistance(left, right) / length);
}

function detectRoleWord(candidate) {
  const value = typeof candidate === 'string' ? candidate.trim().replace(/^@+/, '').toLowerCase() : '';
  const parts = value.split(/[\s._-]+/).filter(Boolean);
  const normalized = normalizeUsername(value);

  return ROLE_WORDS.find((word) =>
    parts.includes(word) ||
    (normalized.length > word.length && (normalized.startsWith(word) || normalized.endsWith(word))),
  ) || '';
}

function removeRoleWordFromEdge(candidate, roleWord) {
  if (!roleWord) return '';
  const normalized = normalizeUsername(candidate);
  if (normalized.startsWith(roleWord)) return normalized.slice(roleWord.length);
  if (normalized.endsWith(roleWord)) return normalized.slice(0, -roleWord.length);
  return '';
}

function getReferences({ officialUsername, officialUsernames }) {
  const values = Array.isArray(officialUsernames) ? [...officialUsernames] : [];
  if (typeof officialUsername === 'string') values.unshift(officialUsername);

  return values
    .map((value) => typeof value === 'string' ? value : value?.username)
    .filter((username) => typeof username === 'string' && normalizeUsername(username));
}

function getSimilarity(candidate, reference, roleWord) {
  const normalizedCandidate = normalizeUsername(candidate);
  const normalizedReference = normalizeUsername(reference);
  const directRatio = similarityRatio(normalizedCandidate, normalizedReference);
  const roleStrippedCandidate = removeRoleWordFromEdge(candidate, roleWord);

  if (roleStrippedCandidate && roleStrippedCandidate === normalizedReference) {
    return Math.max(directRatio, SCORING_RULES.roleWordMatchRatio);
  }
  if (roleStrippedCandidate) {
    return Math.max(directRatio, similarityRatio(roleStrippedCandidate, normalizedReference));
  }
  return directRatio;
}

function similarityPoints(ratio) {
  return SCORING_RULES.similarity.find((rule) => ratio >= rule.minimum)?.points || 0;
}

function getRiskLevel(score) {
  if (score >= SCORING_RULES.thresholds.critical) return 'CRITICAL';
  if (score >= SCORING_RULES.thresholds.high) return 'HIGH';
  if (score >= SCORING_RULES.thresholds.medium) return 'MEDIUM';
  return 'LOW';
}

function analyzeSocialCandidate({
  officialUsername,
  officialUsernames,
  candidateUsername,
  suspiciousUsername,
  paymentRequested,
  credentialRequested,
}) {
  const candidate = candidateUsername ?? suspiciousUsername;
  if (typeof candidate !== 'string' || !normalizeUsername(candidate)) {
    throw new SocialDetectionInputError('A candidate username is required.', 'candidateUsername');
  }
  if (candidate.length > 128) {
    throw new SocialDetectionInputError('Candidate username must be 128 characters or fewer.', 'candidateUsername');
  }
  if (officialUsername !== undefined && typeof officialUsername !== 'string') {
    throw new SocialDetectionInputError('Official username must be a string.', 'officialUsername');
  }
  for (const [field, value] of Object.entries({ paymentRequested, credentialRequested })) {
    if (value !== undefined && typeof value !== 'boolean') {
      throw new SocialDetectionInputError(`${field} must be a boolean.`, field);
    }
  }

  const references = getReferences({ officialUsername, officialUsernames });
  const normalizedCandidate = normalizeUsername(candidate);
  const reasons = [];
  const limitations = [...LIMITATIONS];
  let score = 0;
  let status = 'NEEDS_REVIEW';
  let matchedReference = '';

  if (references.some((reference) => normalizeUsername(reference) === normalizedCandidate)) {
    matchedReference = references.find((reference) => normalizeUsername(reference) === normalizedCandidate);
    reasons.push(`Candidate exactly matches the registered official username ${matchedReference}.`);
    limitations.push('An exact registered username match is not suspicious based on username comparison alone.');
    return {
      score: 0,
      riskLevel: 'LOW',
      status: 'OFFICIAL_MATCH',
      reasons,
      limitations,
      matchedReference,
    };
  }

  if (!references.length) {
    limitations.push('No official reference was provided or found; username similarity could not be assessed.');
  } else {
    const roleWord = detectRoleWord(candidate);
    const comparisons = references.map((reference) => ({
      reference,
      similarity: getSimilarity(candidate, reference, roleWord),
    }));
    const closest = comparisons.reduce((best, item) => item.similarity > best.similarity ? item : best);
    const points = similarityPoints(closest.similarity);
    score += points;
    matchedReference = closest.reference;

    if (roleWord) {
      reasons.push(`Candidate username includes the role-related term “${roleWord}”.`);
      if (removeRoleWordFromEdge(candidate, roleWord) === normalizeUsername(closest.reference)) {
        reasons.push('After removing that added term, the username matches the official reference.');
      }
    }
    if (points > 0) {
      reasons.push(`Candidate username is approximately ${Math.round(closest.similarity * 100)}% similar to an official reference.`);
    }

    if (hasLookalikeSubstitution(candidate, closest.reference)) {
      reasons.push('Candidate uses a lookalike character substitution such as 0 for o or 1 for l or i.');
    }
  }

  if (paymentRequested === true) {
    score += SCORING_RULES.paymentRequested;
    reasons.push('A request for payment was explicitly reported by the user.');
  }
  if (credentialRequested === true) {
    score += SCORING_RULES.credentialRequested;
    reasons.push('A request for credentials was explicitly reported by the user.');
  }

  score = Math.min(100, Math.max(0, Math.round(score)));
  return {
    score,
    riskLevel: getRiskLevel(score),
    status,
    reasons,
    limitations,
    ...(matchedReference ? { matchedReference } : {}),
  };
}

function hasLookalikeSubstitution(candidate, reference) {
  const normalizedCandidate = normalizeUsername(candidate);
  const normalizedReference = normalizeUsername(reference);
  if (normalizedCandidate.length !== normalizedReference.length) return false;

  let foundSubstitution = false;
  for (let index = 0; index < normalizedCandidate.length; index += 1) {
    const candidateCharacter = normalizedCandidate[index];
    const referenceCharacter = normalizedReference[index];
    if (candidateCharacter === referenceCharacter) continue;
    if (!areEquivalentCharacters(candidateCharacter, referenceCharacter)) return false;
    foundSubstitution = true;
  }
  return foundSubstitution;
}

module.exports = {
  SOCIAL_PLATFORMS,
  SocialDetectionInputError,
  analyzeSocialCandidate,
  normalizeUsername,
=======
const PLATFORM_NAMES = new Map([
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['x', 'X'],
  ['twitter', 'X'],
  ['linkedin', 'LinkedIn'],
  ['youtube', 'YouTube'],
  ['other', 'Other'],
]);

const DEFAULT_SCORING = Object.freeze({
  exactOtherPlatform: 50,
  normalizedExact: 40,
  lookalike: 30,
  similar: 25,
  addedOrRemovedText: 20,
  brandNameMention: 20,
  suspiciousTerms: 12,
  paymentReported: 18,
  credentialsReported: 22,
  identityCap: 60,
});

const SUSPICIOUS_TERMS = [
  'support',
  'help',
  'verify',
  'security',
  'customer care',
  'official',
];

const LOOKALIKE_TRANSLATIONS = new Map([
  ['0', 'o'],
  ['1', 'i'],
  ['3', 'e'],
  ['4', 'a'],
  ['5', 's'],
  ['7', 't'],
  ['8', 'b'],
  ['9', 'g'],
]);

function normalizePlatform(value) {
  if (typeof value !== 'string') return null;
  return PLATFORM_NAMES.get(value.trim().toLowerCase()) || null;
}

function normalizeUsername(value) {
  return value.normalize('NFKC').trim().replace(/^@+/, '').toLowerCase();
}

function normalizeComparableUsername(value) {
  return normalizeUsername(value).replace(/[\s_.-]/g, '');
}

function normalizeLookalikes(value) {
  return normalizeComparableUsername(value).replace(/[01345789]/g, (character) =>
    LOOKALIKE_TRANSLATIONS.get(character),
  );
}

function usernameTokens(value) {
  return normalizeUsername(value).match(/[\p{L}\p{N}]+/gu) || [];
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(left, right) {
  const longest = Math.max(left.length, right.length);
  if (!longest) return 1;
  return 1 - levenshteinDistance(left, right) / longest;
}

function riskLevelFor(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

function analyzeSocialProfile({
  brandName,
  officialAccounts,
  platform,
  suspiciousUsername,
  reportedSignals = {},
  scoring = DEFAULT_SCORING,
}) {
  if (typeof brandName !== 'string' || !brandName.trim()) {
    throw new TypeError('brandName is required.');
  }
  if (!Array.isArray(officialAccounts)) {
    throw new TypeError('officialAccounts must be an array.');
  }
  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform) throw new TypeError('platform is invalid.');
  if (typeof suspiciousUsername !== 'string' || !normalizeUsername(suspiciousUsername)) {
    throw new TypeError('suspiciousUsername is required.');
  }
  if (!reportedSignals || typeof reportedSignals !== 'object' || Array.isArray(reportedSignals)) {
    throw new TypeError('reportedSignals must be an object.');
  }
  for (const [signal, value] of Object.entries(reportedSignals)) {
    if (!['paymentRequested', 'credentialRequested'].includes(signal) || typeof value !== 'boolean') {
      throw new TypeError(`reportedSignals.${signal} must be a boolean supported signal.`);
    }
  }
  if (!scoring || typeof scoring !== 'object' || Array.isArray(scoring)) {
    throw new TypeError('scoring must be an object.');
  }
  const scoringRules = { ...DEFAULT_SCORING, ...scoring };
  for (const [rule, value] of Object.entries(scoringRules)) {
    if (!Object.hasOwn(DEFAULT_SCORING, rule) || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`scoring.${rule} must be a non-negative number for a supported rule.`);
    }
  }
  if (scoringRules.identityCap > 100) throw new TypeError('scoring.identityCap must not exceed 100.');

  const canonicalCandidate = normalizeUsername(suspiciousUsername);
  const normalizedCandidate = normalizeComparableUsername(suspiciousUsername);
  const comparableCandidate = normalizedCandidate;
  const accounts = officialAccounts.map((account, index) => {
    if (!account || typeof account !== 'object' || Array.isArray(account)) {
      throw new TypeError(`officialAccounts[${index}] must be an object.`);
    }
    const accountPlatform = normalizePlatform(account.platform);
    if (!accountPlatform) throw new TypeError(`officialAccounts[${index}].platform is invalid.`);
    if (typeof account.username !== 'string' || !normalizeUsername(account.username)) {
      throw new TypeError(`officialAccounts[${index}].username is required.`);
    }
    return {
      platform: accountPlatform,
      username: account.username.trim(),
      normalizedUsername: normalizeUsername(account.username),
      comparableUsername: normalizeComparableUsername(account.username),
      profileUrl: typeof account.profileUrl === 'string' ? account.profileUrl : '',
    };
  });

  const exactOfficialAccount = accounts.find((account) =>
    account.platform === normalizedPlatform && account.normalizedUsername === canonicalCandidate,
  );
  const limitations = accounts.length
    ? []
    : ['No official social accounts are registered; comparison is limited to the brand name and supplied reports.'];
  const disclaimer = 'Heuristic analysis only; this score is not a probability or proof of fraud. Human review is required, and a low score does not confirm the account is safe.';
  const candidate = { platform: normalizedPlatform, username: suspiciousUsername.trim() };

  if (exactOfficialAccount) {
    const reason = `This username matches a registered ${exactOfficialAccount.platform} account; it is excluded from suspicious classification.`;
    return {
      candidate,
      normalizedUsername: normalizedCandidate,
      brand: { name: brandName.trim(), officialAccountCount: accounts.length },
      riskScore: 0,
      riskLevel: 'LOW',
      status: 'OFFICIAL_MATCH',
      reasons: [reason],
      evidence: [{ signal: 'official_account_match', description: reason, points: 0 }],
      matchedOfficialAccount: {
        platform: exactOfficialAccount.platform,
        username: exactOfficialAccount.username,
        profileUrl: exactOfficialAccount.profileUrl,
      },
      limitations,
      disclaimer,
    };
  }

  const evidenceBySignal = new Map();
  function addEvidence(signal, description, points, category = 'identity') {
    const existing = evidenceBySignal.get(signal);
    if (!existing || points > existing.points) {
      evidenceBySignal.set(signal, { signal, description, points, category });
    }
  }

  for (const account of accounts) {
    const officialComparable = account.comparableUsername;
    if (!officialComparable) continue;

    if (account.normalizedUsername === normalizedCandidate && account.platform !== normalizedPlatform) {
      addEvidence(
        'exact_username_other_platform',
        `The username exactly matches a registered ${account.platform} handle, but not an official account on ${normalizedPlatform}.`,
        scoringRules.exactOtherPlatform,
      );
    }

    if (officialComparable === comparableCandidate && account.normalizedUsername !== normalizedCandidate) {
      addEvidence(
        'separator_normalized_match',
        `The handle matches ${account.username} after case and separator normalization.`,
        scoringRules.normalizedExact,
      );
    }

    const lookalikeCandidate = normalizeLookalikes(suspiciousUsername);
    const lookalikeOfficial = normalizeLookalikes(account.username);
    if (lookalikeCandidate === lookalikeOfficial && comparableCandidate !== officialComparable) {
      addEvidence(
        'lookalike_substitution',
        `The handle becomes ${account.username} after common digit-to-letter lookalike substitutions.`,
        scoringRules.lookalike,
      );
    }

    const normalizedSimilarity = similarity(comparableCandidate, officialComparable);
    if (normalizedSimilarity >= 0.72 && comparableCandidate !== officialComparable) {
      addEvidence(
        'username_similarity',
        `The handle is ${(normalizedSimilarity * 100).toFixed(0)}% similar to registered handle ${account.username} after normalization.`,
        scoringRules.similar,
      );
    }

    const candidateTokens = new Set(usernameTokens(suspiciousUsername));
    const officialTokens = usernameTokens(account.username);
    const sharedToken = officialTokens.some((token) => candidateTokens.has(token));
    const containsHandle = comparableCandidate.includes(officialComparable) ||
      officialComparable.includes(comparableCandidate);
    if (
      (sharedToken && candidateTokens.size !== officialTokens.length) ||
      (containsHandle && comparableCandidate !== officialComparable)
    ) {
      addEvidence(
        'added_or_removed_text',
        `The handle contains registered handle ${account.username} with added or removed username text.`,
        scoringRules.addedOrRemovedText,
      );
    }
  }

  const comparableBrandName = normalizeComparableUsername(brandName);
  if (comparableBrandName.length >= 3 && comparableCandidate.includes(comparableBrandName)) {
    addEvidence(
      'brand_name_mention',
      `The brand name ${brandName.trim()} appears within the candidate handle.`,
      scoringRules.brandNameMention,
    );
  }

  const searchableUsername = normalizeComparableUsername(suspiciousUsername);
  const detectedTerms = SUSPICIOUS_TERMS.filter((term) =>
    searchableUsername.includes(normalizeComparableUsername(term)),
  );
  if (detectedTerms.length) {
    addEvidence(
      'suspicious_terms',
      `The handle contains suspicious term${detectedTerms.length > 1 ? 's' : ''}: ${detectedTerms.join(', ')}.`,
      scoringRules.suspiciousTerms,
      'context',
    );
  }

  if (reportedSignals.paymentRequested === true) {
    addEvidence(
      'payment_reported',
      'A payment request was explicitly reported by the user.',
      scoringRules.paymentReported,
      'reported',
    );
  }
  if (reportedSignals.credentialRequested === true) {
    addEvidence(
      'credentials_reported',
      'A password, OTP, or other credential request was explicitly reported by the user.',
      scoringRules.credentialsReported,
      'reported',
    );
  }

  const evidence = [...evidenceBySignal.values()];
  const identityScore = Math.min(
    scoringRules.identityCap,
    evidence.filter((item) => item.category === 'identity').reduce((total, item) => total + item.points, 0),
  );
  const contextScore = evidence.filter((item) => item.category === 'context').reduce((total, item) => total + item.points, 0);
  const reportedScore = evidence.filter((item) => item.category === 'reported').reduce((total, item) => total + item.points, 0);
  const riskScore = Math.max(0, Math.min(100, identityScore + contextScore + reportedScore));
  const riskLevel = riskLevelFor(riskScore);
  const status = riskScore >= 60 && accounts.length ? 'FLAGGED_FOR_REVIEW' : 'NEEDS_REVIEW';
  const reasons = evidence.map((item) => item.description);
  if (!reasons.length) {
    reasons.push('No specific similarity or reported-behavior signals were detected; a low score does not confirm the account is safe.');
  }

  return {
    candidate,
    normalizedUsername: normalizedCandidate,
    brand: { name: brandName.trim(), officialAccountCount: accounts.length },
    riskScore,
    riskLevel,
    status,
    reasons,
    evidence,
    matchedOfficialAccount: null,
    limitations,
    disclaimer,
  };
}

module.exports = {
  DEFAULT_SCORING,
  analyzeSocialProfile,
  normalizePlatform,
  normalizeUsername,
  normalizeComparableUsername,
>>>>>>> 0fdc5c7e1e07a369b137e1a80f999f73cbf0207e
};