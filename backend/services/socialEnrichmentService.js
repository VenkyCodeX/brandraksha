const NITTER_INSTANCES = [
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
];
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function enrichViaTwitterApi(username, bearerToken) {
  const url = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=name,description,public_metrics,verified,profile_image_url`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const user = payload?.data;
  if (!user) return null;
  return {
    displayName: user.name || '',
    bio: user.description || '',
    followerCount: user.public_metrics?.followers_count ?? null,
    verified: user.verified ?? false,
    profileImageUrl: user.profile_image_url?.replace('_normal', '_400x400') || '',
    source: 'Twitter API v2',
  };
}

function parseNitterHtml(html, username) {
  const displayName = html.match(/<a class="fullname"[^>]*>([^<]+)<\/a>/)?.[1]?.trim() || '';
  const bio = html.match(/<div class="profile-bio"[^>]*><p>([^<]*)<\/p>/)?.[1]?.trim() || '';
  const followerText = html.match(/Followers<\/span>\s*<\/li>\s*<li[^>]*>\s*<span[^>]*>([\d,KkMm.]+)<\/span>/)?.[1] || '';
  const verified = /<svg[^>]*class="[^"]*verified[^"]*"/i.test(html);
  const profileImageUrl = html.match(/<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/)?.[1] || '';

  function parseCount(text) {
    if (!text) return null;
    const clean = text.replace(/,/g, '').trim().toUpperCase();
    if (clean.endsWith('M')) return Math.round(parseFloat(clean) * 1_000_000);
    if (clean.endsWith('K')) return Math.round(parseFloat(clean) * 1_000);
    const n = parseInt(clean, 10);
    return Number.isNaN(n) ? null : n;
  }

  return {
    displayName,
    bio,
    followerCount: parseCount(followerText),
    verified,
    profileImageUrl: profileImageUrl.startsWith('http') ? profileImageUrl : '',
    source: 'Nitter (public instance)',
  };
}

async function enrichViaNitter(username) {
  for (const instance of NITTER_INSTANCES) {
    try {
      const response = await fetchWithTimeout(`${instance}/${encodeURIComponent(username)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 BrandProtect/1.0' },
      });
      if (!response.ok) continue;
      const html = await response.text();
      if (!html.includes('profile-bio') && !html.includes('fullname')) continue;
      const result = parseNitterHtml(html, username);
      if (result.displayName || result.bio) return result;
    } catch {
      // try next instance
    }
  }
  return null;
}

/**
 * Enriches a social profile for X/Twitter usernames.
 * Returns enrichment data or null if unavailable.
 * Supported platforms: X, Twitter.
 */
async function enrichSocialProfile(platform, username) {
  const normalizedPlatform = (platform || '').toLowerCase();
  if (normalizedPlatform !== 'x' && normalizedPlatform !== 'twitter') return null;
  if (!username) return null;

  const clean = username.replace(/^@/, '').trim();
  if (!clean) return null;

  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (bearerToken) {
    try {
      const result = await enrichViaTwitterApi(clean, bearerToken);
      if (result) return result;
    } catch {
      // fall through to Nitter
    }
  }

  return enrichViaNitter(clean);
}

module.exports = { enrichSocialProfile };
