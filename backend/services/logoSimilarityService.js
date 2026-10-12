const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const ipaddr = require('ipaddr.js');
const sharp = require('sharp');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 6000;
const HASH_SIZE = 8;
const RESIZE_SIZE = 32;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);
const COMPARISON_METHOD = 'pHash (8x8 DCT, 63-bit)';

class LogoSimilarityError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'LogoSimilarityError';
    this.status = status;
  }
}

function isPublicAddress(address) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

function normalizeHostname(hostname) {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
}

async function resolvePublicImageUrl(input, { resolveHost = dns.lookup } = {}) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new LogoSimilarityError('UNSUPPORTED_URL', 'Image URL must be a valid HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new LogoSimilarityError('UNSUPPORTED_URL', 'Only HTTP and HTTPS image URLs are supported.');
  }
  if (url.username || url.password) {
    throw new LogoSimilarityError('UNSAFE_URL', 'Image URLs containing embedded credentials are not allowed.');
  }
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    throw new LogoSimilarityError('UNSAFE_URL', 'Image URLs on non-standard ports are not allowed.');
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname === 'localhost' || /\.(?:localhost|local|internal|lan|home\.arpa)$/.test(hostname)) {
    throw new LogoSimilarityError('UNSAFE_URL', 'Local and internal image hosts are not allowed.');
  }

  let addresses;
  if (ipaddr.isValid(hostname)) {
    addresses = [{ address: ipaddr.process(hostname).toString(), family: ipaddr.process(hostname).kind() === 'ipv4' ? 4 : 6 }];
  } else {
    try {
      addresses = await resolveHost(hostname, { all: true, verbatim: true });
    } catch {
      throw new LogoSimilarityError('FETCH_FAILED', 'The image host could not be resolved.');
    }
  }
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new LogoSimilarityError('UNSAFE_URL', 'Image hosts must resolve only to public IP addresses.');
  }

  url.hash = '';
  return { url, address: addresses[0].address, family: addresses[0].family };
}

function requestImageOnce(url, resolvedAddress) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const pinnedLookup = (_hostname, options, callback) => {
      if (options?.all) {
        callback(null, [{ address: resolvedAddress.address, family: resolvedAddress.family }]);
      } else {
        callback(null, resolvedAddress.address, resolvedAddress.family);
      }
    };
    let settled = false;
    let timeoutHandle;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    };

    const request = transport.request(url, {
      method: 'GET',
      agent: false,
      lookup: pinnedLookup,
      headers: {
        Accept: 'image/jpeg,image/png,image/webp,image/avif',
        'Accept-Encoding': 'identity',
        'User-Agent': 'BrandProtect-Logo-Review/1.0',
      },
    }, (response) => {
      const statusCode = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = response.headers.location;
        response.resume();
        settled = true;
        clearTimeout(timeoutHandle);
        resolve({ redirect: location || '' });
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        fail(new LogoSimilarityError('FETCH_FAILED', `Image server returned HTTP ${statusCode || 'unknown'}.`));
        return;
      }

      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        response.destroy();
        fail(new LogoSimilarityError('TOO_LARGE', 'Image exceeds the 5 MB download limit.'));
        return;
      }

      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          response.destroy();
          request.destroy();
          fail(new LogoSimilarityError('TOO_LARGE', 'Image exceeds the 5 MB download limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolve({ buffer: Buffer.concat(chunks), contentType: response.headers['content-type'] || '' });
      });
      response.on('error', () => fail(new LogoSimilarityError('FETCH_FAILED', 'Image download was interrupted.')));
    });

    timeoutHandle = setTimeout(() => {
      fail(new LogoSimilarityError('FETCH_FAILED', 'Image download timed out.'));
      request.destroy();
    }, REQUEST_TIMEOUT_MS);
    request.on('error', (error) => {
      if (error instanceof LogoSimilarityError) fail(error);
      else fail(new LogoSimilarityError('FETCH_FAILED', 'Image download failed. Check the URL and try again.'));
    });
    request.end();
  });
}

async function downloadImageFromUrl(input, dependencies = {}) {
  const resolveHost = dependencies.resolveHost || dns.lookup;
  const requestImage = dependencies.requestImage || requestImageOnce;
  let currentUrl = input;
  let initialResolution = dependencies.initialResolution || null;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const resolved = initialResolution || await resolvePublicImageUrl(currentUrl, { resolveHost });
    initialResolution = null;
    const response = await requestImage(resolved.url, resolved);
    if (!response.redirect) {
      if (!Buffer.isBuffer(response.buffer) || response.buffer.length === 0) {
        throw new LogoSimilarityError('FETCH_FAILED', 'Image server returned an empty response.');
      }
      if (response.buffer.length > MAX_IMAGE_BYTES) {
        throw new LogoSimilarityError('TOO_LARGE', 'Image exceeds the 5 MB download limit.');
      }
      return response.buffer;
    }
    if (redirectCount === MAX_REDIRECTS) {
      throw new LogoSimilarityError('FETCH_FAILED', 'Image URL exceeded the redirect limit.');
    }
    try {
      currentUrl = new URL(response.redirect, resolved.url).toString();
    } catch {
      throw new LogoSimilarityError('FETCH_FAILED', 'Image server returned an invalid redirect.');
    }
  }
  throw new LogoSimilarityError('FETCH_FAILED', 'Image could not be retrieved.');
}

function dctHash(pixels) {
  const size = RESIZE_SIZE;
  const coefficients = [];
  const cosine = Array.from({ length: HASH_SIZE }, (_, frequency) =>
    Array.from({ length: size }, (_, position) =>
      Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * size)),
    ),
  );

  for (let vertical = 0; vertical < HASH_SIZE; vertical += 1) {
    for (let horizontal = 0; horizontal < HASH_SIZE; horizontal += 1) {
      let sum = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          sum += pixels[y * size + x] * cosine[vertical][y] * cosine[horizontal][x];
        }
      }
      const verticalScale = vertical === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size);
      const horizontalScale = horizontal === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size);
      coefficients.push(sum * verticalScale * horizontalScale);
    }
  }

  const lowFrequency = coefficients.slice(1);
  const sorted = [...lowFrequency].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  return lowFrequency.map((coefficient) => coefficient > median);
}

async function normalizeImage(buffer, imageProcessor = sharp) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new LogoSimilarityError('INVALID_IMAGE', 'Image data is empty or invalid.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new LogoSimilarityError('TOO_LARGE', 'Image exceeds the 5 MB limit.');
  }

  let metadata;
  try {
    metadata = await imageProcessor(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata();
  } catch (error) {
    if (/pixel limit|exceeds.*limit/i.test(error.message || '')) {
      throw new LogoSimilarityError('TOO_LARGE', 'Image dimensions exceed the 20 megapixel limit.');
    }
    throw new LogoSimilarityError('INVALID_IMAGE', 'Image content could not be decoded.');
  }
  if (!ALLOWED_FORMATS.has(metadata.format)) {
    throw new LogoSimilarityError('UNSUPPORTED_FORMAT', 'Supported image formats are JPEG, PNG, WebP, and AVIF.');
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw new LogoSimilarityError('TOO_LARGE', 'Image dimensions exceed the 20 megapixel limit.');
  }

  try {
    const pipeline = imageProcessor(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' });
    const pixels = await pipeline.clone()
      .resize(RESIZE_SIZE, RESIZE_SIZE, { fit: 'contain', background: '#ffffff' })
      .greyscale()
      .raw()
      .toBuffer();
    const preview = await pipeline.clone()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return { hash: dctHash(pixels), preview };
  } catch {
    throw new LogoSimilarityError('INVALID_IMAGE', 'Image content could not be normalized safely.');
  }
}

function failureResult(status, explanation, limitations = []) {
  return {
    status,
    similarityScore: null,
    comparisonMethod: null,
    evidence: null,
    explanation,
    reviewRecommendation: 'MANUAL_REVIEW',
    limitations,
    images: null,
  };
}

async function readImageSource(buffer, url, dependencies, initialResolution) {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (typeof url !== 'string' || !url.trim()) {
    throw new LogoSimilarityError('CANDIDATE_IMAGE_MISSING', 'A candidate image URL is required.');
  }
  return downloadImageFromUrl(url, { ...dependencies, initialResolution });
}

async function compareLogoImages({
  officialLogoUrl,
  candidateImageUrl,
  officialLogoBuffer,
  candidateImageBuffer,
  dependencies = {},
  imageProcessor = sharp,
}) {
  if (!Buffer.isBuffer(officialLogoBuffer) && (typeof officialLogoUrl !== 'string' || !officialLogoUrl.trim())) {
    return failureResult('REFERENCE_IMAGE_MISSING', 'No official logo is registered for this brand.', ['Add an official logo URL to the saved brand profile before comparing images.']);
  }
  if (!Buffer.isBuffer(candidateImageBuffer) && (typeof candidateImageUrl !== 'string' || !candidateImageUrl.trim())) {
    return failureResult('CANDIDATE_IMAGE_MISSING', 'Submit a candidate image URL to run a comparison.');
  }

  try {
    let officialResolution = null;
    let candidateResolution = null;
    if (!Buffer.isBuffer(officialLogoBuffer)) {
      officialResolution = await resolvePublicImageUrl(officialLogoUrl, { resolveHost: dependencies.resolveHost || dns.lookup });
    }
    if (!Buffer.isBuffer(candidateImageBuffer)) {
      candidateResolution = await resolvePublicImageUrl(candidateImageUrl, { resolveHost: dependencies.resolveHost || dns.lookup });
    }
    const [officialBuffer, candidateBuffer] = await Promise.all([
      readImageSource(officialLogoBuffer, officialLogoUrl, dependencies, officialResolution),
      readImageSource(candidateImageBuffer, candidateImageUrl, dependencies, candidateResolution),
    ]);
    const official = await normalizeImage(officialBuffer, imageProcessor);
    const candidate = await normalizeImage(candidateBuffer, imageProcessor);
    let distance = 0;
    for (let index = 0; index < official.hash.length; index += 1) {
      if (official.hash[index] !== candidate.hash[index]) distance += 1;
    }
    const similarityScore = Math.round((1 - distance / official.hash.length) * 100);
    return {
      status: 'COMPARED',
      similarityScore,
      comparisonMethod: COMPARISON_METHOD,
      evidence: { hammingDistance: distance, hashBits: official.hash.length },
      explanation: `The normalized images differ by ${distance} of ${official.hash.length} perceptual-hash bits. This visual similarity score is a heuristic, not proof of impersonation or brand affiliation.`,
      reviewRecommendation: 'HUMAN_REVIEW',
      limitations: ['Perceptual hashing can be affected by crops, overlays, transparency, and substantial visual edits.', 'Visually similar logos may be legitimate; confirm context with a human reviewer.'],
      images: {
        officialPreviewDataUrl: `data:image/png;base64,${official.preview.toString('base64')}`,
        candidatePreviewDataUrl: `data:image/png;base64,${candidate.preview.toString('base64')}`,
      },
    };
  } catch (error) {
    if (error instanceof LogoSimilarityError) {
      return failureResult(error.status, error.message, ['No similarity score was produced because both images could not be safely compared.']);
    }
    return failureResult('PROCESSING_FAILED', 'Image comparison could not be completed safely.', ['No similarity score was produced.']);
  }
}

module.exports = {
  ALLOWED_FORMATS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  LogoSimilarityError,
  compareLogoImages,
  downloadImageFromUrl,
  isPublicAddress,
  normalizeImage,
  resolvePublicImageUrl,
};