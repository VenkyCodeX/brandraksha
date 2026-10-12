const REQUEST_TIMEOUT_DEFAULT_MS = 8000;
const REQUEST_TIMEOUT_MAX_MS = 15000;

function timeoutMilliseconds() {
  const configured = Number.parseInt(process.env.SOCIAL_PROVIDER_TIMEOUT_MS, 10);
  if (!Number.isFinite(configured) || configured < 1) return REQUEST_TIMEOUT_DEFAULT_MS;
  return Math.min(configured, REQUEST_TIMEOUT_MAX_MS);
}

async function requestProviderJson(provider, url, headers = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMilliseconds()),
    });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    return {
      provider,
      status: timedOut ? 'TIMEOUT' : 'PROVIDER_ERROR',
      message: timedOut
        ? `${provider} did not respond before the request timed out.`
        : `${provider} could not be reached. Check network access and try again later.`,
    };
  }

  if (response.status === 429) {
    return {
      provider,
      status: 'RATE_LIMITED',
      message: `${provider} rate limit reached. Wait for the provider's reset window before requesting again.`,
    };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      provider,
      status: 'ACCESS_DENIED',
      message: `${provider} denied access. Check API permissions, account eligibility, and plan access.`,
    };
  }
  if (response.status === 404) {
    return {
      provider,
      status: 'NOT_FOUND',
      message: `${provider} returned no matching profile for this submitted username. This does not establish that the account is safe.`,
    };
  }
  if (!response.ok) {
    return {
      provider,
      status: 'PROVIDER_ERROR',
      message: `${provider} returned an unexpected response (HTTP ${response.status}). Check API availability and permissions.`,
    };
  }

  try {
    return { provider, status: 'FOUND', payload: await response.json() };
  } catch {
    return {
      provider,
      status: 'PROVIDER_ERROR',
      message: `${provider} returned an unreadable response. Try again later.`,
    };
  }
}

function notConfigured(provider, variables) {
  return {
    provider,
    status: 'NOT_CONFIGURED',
    message: `Configure ${variables.join(' and ')} in the backend environment to enable ${provider}.`,
  };
}

function unsupported(provider, message) {
  return { provider, status: 'UNSUPPORTED', message };
}

module.exports = { notConfigured, requestProviderJson, unsupported };