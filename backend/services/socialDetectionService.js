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
      reasons.push(`Candidate username includes the role-related term "${roleWord}".`);
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
};
