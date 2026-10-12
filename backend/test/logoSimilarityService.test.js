const assert = require('node:assert/strict');
const sharp = require('sharp');
const { test } = require('node:test');
const {
  MAX_IMAGE_BYTES,
  compareLogoImages,
  downloadImageFromUrl,
  normalizeImage,
  resolvePublicImageUrl,
} = require('../services/logoSimilarityService');

async function logoImage(kind = 'square') {
  const drawing = kind === 'square'
    ? '<rect x="24" y="24" width="80" height="80" fill="#122b3a" />'
    : kind === 'modified'
      ? '<rect x="24" y="24" width="80" height="80" fill="#18303d" />'
      : '<path d="M0 0h64v128H0z" fill="#111" /><path d="M64 0h64v128H64z" fill="#fff" />';
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#fff"/>${drawing}</svg>`);
  return sharp(svg).png().toBuffer();
}

test('identical supported images produce a 100 similarity score', async () => {
  const image = await logoImage();
  const result = await compareLogoImages({ officialLogoBuffer: image, candidateImageBuffer: image });

  assert.equal(result.status, 'COMPARED');
  assert.equal(result.similarityScore, 100);
  assert.equal(result.comparisonMethod, 'pHash (8x8 DCT, 63-bit)');
  assert.equal(result.reviewRecommendation, 'HUMAN_REVIEW');
  assert.match(result.explanation, /not proof of impersonation/);
});

test('visually modified images remain highly similar under pHash', async () => {
  const [officialLogoBuffer, candidateImageBuffer] = await Promise.all([logoImage(), logoImage('modified')]);
  const result = await compareLogoImages({ officialLogoBuffer, candidateImageBuffer });

  assert.equal(result.status, 'COMPARED');
  assert.ok(result.similarityScore >= 65);
  assert.equal(typeof result.evidence.hammingDistance, 'number');
});

test('clearly different supported images produce a lower score', async () => {
  const [officialLogoBuffer, candidateImageBuffer] = await Promise.all([logoImage(), logoImage('different')]);
  const result = await compareLogoImages({ officialLogoBuffer, candidateImageBuffer });

  assert.equal(result.status, 'COMPARED');
  assert.ok(result.similarityScore < 65);
});

test('missing official logo returns REFERENCE_IMAGE_MISSING without a score', async () => {
  const result = await compareLogoImages({ candidateImageBuffer: await logoImage() });

  assert.equal(result.status, 'REFERENCE_IMAGE_MISSING');
  assert.equal(result.similarityScore, null);
});

test('malformed and unsupported image bytes produce explicit failures without a score', async () => {
  const malformed = await compareLogoImages({ officialLogoBuffer: Buffer.from('not image'), candidateImageBuffer: Buffer.from('also not image') });
  const unsupported = await compareLogoImages({
    officialLogoBuffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
    candidateImageBuffer: await logoImage(),
  });

  assert.equal(malformed.status, 'INVALID_IMAGE');
  assert.equal(malformed.similarityScore, null);
  assert.equal(unsupported.status, 'UNSUPPORTED_FORMAT');
  assert.equal(unsupported.similarityScore, null);
});

test('oversized image byte buffers are rejected before decoding', async () => {
  const result = await compareLogoImages({
    officialLogoBuffer: await logoImage(),
    candidateImageBuffer: Buffer.alloc(MAX_IMAGE_BYTES + 1),
  });

  assert.equal(result.status, 'TOO_LARGE');
  assert.equal(result.similarityScore, null);
});

test('localhost and private/internal destinations are rejected', async () => {
  for (const url of [
    'http://localhost/logo.png',
    'http://127.0.0.1/logo.png',
    'http://192.168.1.4/logo.png',
    'http://[::1]/logo.png',
    'file:///etc/passwd',
  ]) {
    await assert.rejects(resolvePublicImageUrl(url), { name: 'LogoSimilarityError' });
  }
  await assert.rejects(
    resolvePublicImageUrl('https://rebind.example/logo.png', {
      resolveHost: async () => [{ address: '10.1.2.3', family: 4 }],
    }),
    { status: 'UNSAFE_URL' },
  );
});

test('redirects to blocked destinations are rejected before a second request', async () => {
  let requestCount = 0;
  await assert.rejects(downloadImageFromUrl('https://public.example/logo.png', {
    resolveHost: async () => [{ address: '8.8.8.8', family: 4 }],
    requestImage: async () => {
      requestCount += 1;
      return { redirect: 'http://127.0.0.1/private.png' };
    },
  }), { status: 'UNSAFE_URL' });
  assert.equal(requestCount, 1);
});

test('candidate URL safety is checked before either image is requested', async () => {
  let requestCount = 0;
  const result = await compareLogoImages({
    officialLogoUrl: 'https://reference.example/logo.png',
    candidateImageUrl: 'http://127.0.0.1/private.png',
    dependencies: {
      resolveHost: async () => [{ address: '8.8.8.8', family: 4 }],
      requestImage: async () => {
        requestCount += 1;
        return { buffer: Buffer.from('not used') };
      },
    },
  });

  assert.equal(result.status, 'UNSAFE_URL');
  assert.equal(result.similarityScore, null);
  assert.equal(requestCount, 0);
});

test('oversized downloaded responses are rejected before image processing', async () => {
  await assert.rejects(downloadImageFromUrl('https://public.example/logo.png', {
    resolveHost: async () => [{ address: '8.8.8.8', family: 4 }],
    requestImage: async () => ({ buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) }),
  }), { status: 'TOO_LARGE' });
});

test('image normalization rejects a pixel-dimension bomb', async () => {
  const hugeImage = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: '#fff' },
  }).png().toBuffer();
  const result = await compareLogoImages({
    officialLogoBuffer: await logoImage(),
    candidateImageBuffer: hugeImage,
  });

  assert.equal(result.status, 'TOO_LARGE');
  assert.equal(result.similarityScore, null);
});

test('unsupported schemes are rejected before DNS or requests', async () => {
  await assert.rejects(resolvePublicImageUrl('ftp://example.com/logo.png'), { status: 'UNSUPPORTED_URL' });
});