const assert = require('node:assert/strict');
const { test } = require('node:test');
const metaInstagramProvider = require('../services/socialProviders/metaInstagramProvider');
const xApiProvider = require('../services/socialProviders/xApiProvider');
const linkedinProvider = require('../services/socialProviders/linkedinProvider');
const { requestProviderJson } = require('../services/socialProviders/providerUtils');

function withEnvironment(values, callback) {
  const previous = new Map();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });
}

test('Meta reports NOT_CONFIGURED without credentials and does not make a request', async () => {
  await withEnvironment({ META_ACCESS_TOKEN: undefined, META_IG_USER_ID: undefined, META_GRAPH_API_VERSION: undefined }, async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('fetch must not be called'); };
    try {
      const result = await metaInstagramProvider.lookupProfile({ platform: 'Instagram', username: 'candidate' });
      assert.equal(result.status, 'NOT_CONFIGURED');
      assert.match(result.message, /META_ACCESS_TOKEN/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('X maps rate limits without retrying or returning its bearer token', async () => {
  await withEnvironment({ X_BEARER_TOKEN: 'provider-secret-test-value' }, async () => {
    const originalFetch = global.fetch;
    let requestCount = 0;
    global.fetch = async (_url, options) => {
      requestCount += 1;
      assert.equal(options.headers.Authorization, 'Bearer provider-secret-test-value');
      return { status: 429, ok: false };
    };
    try {
      const result = await xApiProvider.lookupProfile({ platform: 'X', username: 'candidate' });
      assert.equal(result.status, 'RATE_LIMITED');
      assert.equal(requestCount, 1);
      assert.equal(JSON.stringify(result).includes('provider-secret-test-value'), false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('LinkedIn lookup is explicitly unsupported and performs no request', async () => {
  const result = await linkedinProvider.lookupProfile({ platform: 'LinkedIn', username: 'candidate' });

  assert.equal(result.status, 'UNSUPPORTED');
  assert.match(result.message, /No approved LinkedIn API access/);
});

test('Meta adapter does not query a non-Instagram candidate', async () => {
  const result = await metaInstagramProvider.lookupProfile({ platform: 'Facebook', username: 'candidate' });

  assert.equal(result.status, 'UNSUPPORTED');
});

test('Meta rejects provider-expression characters before making a request', async () => {
  await withEnvironment({
    META_ACCESS_TOKEN: 'meta-test-token',
    META_IG_USER_ID: '123456789',
    META_GRAPH_API_VERSION: 'v23.0',
  }, async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('fetch must not be called'); };
    try {
      const result = await metaInstagramProvider.lookupProfile({ platform: 'Instagram', username: 'name){hack' });
      assert.equal(result.status, 'INVALID_CANDIDATE');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('X maps an official API response to minimal provider-sourced profile data', async () => {
  await withEnvironment({ X_BEARER_TOKEN: 'x-test-token' }, async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      assert.match(String(url), /^https:\/\/api\.x\.com\/2\/users\/by\/username\/candidate/);
      assert.equal(options.headers.Authorization, 'Bearer x-test-token');
      return {
        status: 200,
        ok: true,
        json: async () => ({ data: { username: 'candidate', name: 'Public name' } }),
      };
    };
    try {
      const result = await xApiProvider.lookupProfile({ platform: 'X', username: 'candidate' });
      assert.equal(result.status, 'FOUND');
      assert.deepEqual(result.profile, {
        platform: 'X',
        username: 'candidate',
        displayName: 'Public name',
        profileUrl: 'https://x.com/candidate',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('provider request timeouts map to a clear status without retrying', async () => {
  const originalFetch = global.fetch;
  let requestCount = 0;
  global.fetch = async () => {
    requestCount += 1;
    const error = new Error('request timed out');
    error.name = 'TimeoutError';
    throw error;
  };
  try {
    const result = await requestProviderJson('X_API', 'https://api.x.com/2/users/by/username/candidate');
    assert.equal(result.status, 'TIMEOUT');
    assert.equal(requestCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
});