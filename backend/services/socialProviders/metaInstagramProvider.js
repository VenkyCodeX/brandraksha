const { normalizePlatform } = require('../socialDetectionService');
const { notConfigured, requestProviderJson, unsupported } = require('./providerUtils');

const PROVIDER = 'META_INSTAGRAM';

async function lookupProfile(candidate) {
  if (normalizePlatform(candidate.platform) !== 'Instagram') {
    return unsupported(PROVIDER, 'Meta Business Discovery is available here only for eligible Instagram professional accounts; this candidate platform is not queried.');
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  const instagramUserId = process.env.META_IG_USER_ID;
  const graphApiVersion = process.env.META_GRAPH_API_VERSION;
  const missingVariables = [];
  if (!accessToken) missingVariables.push('META_ACCESS_TOKEN');
  if (!instagramUserId) missingVariables.push('META_IG_USER_ID');
  if (!graphApiVersion) missingVariables.push('META_GRAPH_API_VERSION');
  if (missingVariables.length) return notConfigured(PROVIDER, missingVariables);
  if (!/^\d+$/.test(instagramUserId) || !/^v\d+\.\d+$/.test(graphApiVersion)) {
    return {
      provider: PROVIDER,
      status: 'INVALID_CONFIGURATION',
      message: 'Set META_IG_USER_ID to the authorized numeric Instagram professional-account ID and META_GRAPH_API_VERSION to an approved version.',
    };
  }

  const username = String(candidate.username || '').trim().replace(/^@+/, '');
  if (!username) return unsupported(PROVIDER, 'Meta Business Discovery requires a submitted Instagram username.');
  if (!/^[a-z0-9._]{1,30}$/i.test(username)) {
    return {
      provider: PROVIDER,
      status: 'INVALID_CANDIDATE',
      message: 'Meta Business Discovery requires an Instagram username containing only letters, numbers, periods, or underscores (up to 30 characters).',
    };
  }

  const url = new URL(`https://graph.facebook.com/${graphApiVersion}/${instagramUserId}`);
  url.searchParams.set(
    'fields',
    `business_discovery.username(${username}){username,name,profile_picture_url,website}`,
  );
  const result = await requestProviderJson(PROVIDER, url, {
    Authorization: `Bearer ${accessToken}`,
  });
  if (result.status !== 'FOUND') return result;

  const profile = result.payload?.business_discovery;
  if (!profile || typeof profile.username !== 'string') {
    return {
      provider: PROVIDER,
      status: 'NOT_FOUND',
      message: 'Meta returned no eligible Business Discovery profile for the submitted username. This does not establish that the account is safe.',
    };
  }
  const foundUsername = profile.username.replace(/^@+/, '');
  return {
    provider: PROVIDER,
    status: 'FOUND',
    profile: {
      platform: 'Instagram',
      username: foundUsername,
      displayName: typeof profile.name === 'string' ? profile.name.slice(0, 160) : '',
      profileUrl: `https://www.instagram.com/${encodeURIComponent(foundUsername)}/`,
    },
  };
}

module.exports = { id: PROVIDER, lookupProfile };