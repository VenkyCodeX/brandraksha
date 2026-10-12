const { normalizePlatform } = require('../socialDetectionService');
const { notConfigured, requestProviderJson, unsupported } = require('./providerUtils');

const PROVIDER = 'X_API';

async function lookupProfile(candidate) {
  if (normalizePlatform(candidate.platform) !== 'X') {
    return unsupported(PROVIDER, 'X API username lookup is only available for candidates on X; this candidate platform is not queried.');
  }

  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) return notConfigured(PROVIDER, ['X_BEARER_TOKEN']);

  const username = String(candidate.username || '').trim().replace(/^@+/, '');
  if (!username) return unsupported(PROVIDER, 'X API lookup requires a submitted username.');
  if (!/^[a-z0-9_]{1,15}$/i.test(username)) {
    return {
      provider: PROVIDER,
      status: 'INVALID_CANDIDATE',
      message: 'X username lookup requires a handle containing only letters, numbers, or underscores (up to 15 characters).',
    };
  }

  const url = new URL(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`);
  url.searchParams.set('user.fields', 'username,name,profile_image_url');
  const result = await requestProviderJson(PROVIDER, url, {
    Authorization: `Bearer ${bearerToken}`,
  });
  if (result.status !== 'FOUND') return result;

  const profile = result.payload?.data;
  if (!profile || typeof profile.username !== 'string') {
    return {
      provider: PROVIDER,
      status: 'NOT_FOUND',
      message: 'X returned no profile for the submitted username. This does not establish that the account is safe.',
    };
  }
  const foundUsername = profile.username.replace(/^@+/, '');
  return {
    provider: PROVIDER,
    status: 'FOUND',
    profile: {
      platform: 'X',
      username: foundUsername,
      displayName: typeof profile.name === 'string' ? profile.name.slice(0, 160) : '',
      profileUrl: `https://x.com/${encodeURIComponent(foundUsername)}`,
    },
  };
}

module.exports = { id: PROVIDER, lookupProfile };