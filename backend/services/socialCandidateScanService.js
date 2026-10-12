const { analyzeSocialProfile } = require('./socialDetectionService');
const { SOCIAL_PROVIDERS } = require('./socialProviders');

const PROVIDER_FAILURE_STATUSES = new Set([
  'ACCESS_DENIED',
  'INVALID_CANDIDATE',
  'INVALID_CONFIGURATION',
  'NOT_CONFIGURED',
  'PROVIDER_ERROR',
  'RATE_LIMITED',
  'TIMEOUT',
  'UNSUPPORTED',
]);

function redactProviderText(value, limit) {
  let text = value;
  for (const variable of ['META_ACCESS_TOKEN', 'X_BEARER_TOKEN']) {
    const secret = process.env[variable];
    if (secret) text = text.replaceAll(secret, '[redacted]');
  }
  return text
    .replace(/\b(?:bearer|access[_-]?token|api[_-]?key)\s*[=:]?\s*[^\s,;]+/gi, '[redacted credential]')
    .slice(0, limit);
}

function safeProviderResult(providerId, result) {
  const allowedStatuses = new Set([
    'ACCESS_DENIED',
    'FOUND',
    'INVALID_CANDIDATE',
    'INVALID_CONFIGURATION',
    'NOT_CONFIGURED',
    'NOT_FOUND',
    'PROVIDER_ERROR',
    'RATE_LIMITED',
    'TIMEOUT',
    'UNSUPPORTED',
  ]);
  const status = allowedStatuses.has(result?.status) ? result.status : 'PROVIDER_ERROR';
  const safeResult = {
    provider: providerId,
    status,
    source: status === 'FOUND' ? providerId : null,
  };
  if (typeof result?.message === 'string') {
    safeResult.message = redactProviderText(result.message, 300);
  }
  if (status === 'FOUND' && result.profile && typeof result.profile === 'object') {
    safeResult.profile = {
      platform: typeof result.profile.platform === 'string' ? redactProviderText(result.profile.platform, 40) : '',
      username: typeof result.profile.username === 'string' ? redactProviderText(result.profile.username, 100) : '',
      displayName: typeof result.profile.displayName === 'string' ? redactProviderText(result.profile.displayName, 160) : '',
      profileUrl: typeof result.profile.profileUrl === 'string' ? redactProviderText(result.profile.profileUrl, 500) : '',
    };
  }
  return safeResult;
}

async function scanCandidates({
  brand,
  candidates,
  providers = [],
  reportedSignals = {},
  providerAdapters = SOCIAL_PROVIDERS,
}) {
  const findings = [];
  const providerErrors = [];

  for (const candidate of candidates) {
    const analysis = analyzeSocialProfile({
      brandName: brand.brandName,
      officialAccounts: brand.socialAccounts,
      platform: candidate.platform,
      suspiciousUsername: candidate.username,
      reportedSignals,
    });
    const providerResults = [];

    for (const providerId of providers) {
      const adapter = providerAdapters[providerId];
      let result;
      try {
        result = adapter
          ? await adapter.lookupProfile(candidate)
          : { status: 'UNSUPPORTED', message: 'This provider is not supported.' };
      } catch {
        result = {
          status: 'PROVIDER_ERROR',
          message: `${providerId} lookup failed unexpectedly. Check provider configuration and try again later.`,
        };
      }
      const safeResult = safeProviderResult(providerId, result);
      providerResults.push(safeResult);
      if (PROVIDER_FAILURE_STATUSES.has(safeResult.status)) {
        providerErrors.push({ provider: providerId, status: safeResult.status, message: safeResult.message || `${providerId} lookup was unavailable.` });
      }
    }

    findings.push({
      candidate: {
        platform: candidate.platform,
        username: candidate.username,
        profileUrl: candidate.profileUrl || '',
      },
      source: 'MANUAL_INPUT',
      analysis,
      providerResults,
    });
  }

  const providerStatuses = findings.flatMap((finding) => finding.providerResults.map((result) => result.status));
  const scanStatus = !providers.length
    ? 'MANUAL_ONLY'
    : providerStatuses.some((status) => PROVIDER_FAILURE_STATUSES.has(status))
      ? 'COMPLETED_WITH_PROVIDER_LIMITATIONS'
      : 'COMPLETED_WITH_PROVIDER_RESPONSES';

  return {
    source: 'MANUAL_INPUT',
    scanStatus,
    candidateCount: findings.length,
    findings,
    providerErrors,
    disclaimer: 'Candidates were supplied manually. Provider responses only describe the submitted usernames and do not constitute continuous monitoring or proof of fraud. Missing data is not evidence that an account is safe.',
  };
}

module.exports = { scanCandidates, safeProviderResult };