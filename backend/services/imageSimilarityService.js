const sharp = require('sharp');

const HASH_SIZE = 8;
const FETCH_TIMEOUT_MS = 8000;

async function fetchImageBuffer(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'BrandProtect/1.0' },
  });
  if (!response.ok) throw new Error(`Image fetch failed: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

async function computeHash(buffer) {
  const { data } = await sharp(buffer)
    .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
  return Array.from(data).map((v) => (v >= avg ? 1 : 0));
}

function hammingDistance(hashA, hashB) {
  return hashA.reduce((diff, bit, i) => diff + (bit !== hashB[i] ? 1 : 0), 0);
}

/**
 * Returns a similarity score 0–100 between two image URLs.
 * Returns null if either image cannot be fetched or processed.
 */
async function compareImageUrls(urlA, urlB) {
  if (!urlA || !urlB) return null;
  try {
    const [bufA, bufB] = await Promise.all([fetchImageBuffer(urlA), fetchImageBuffer(urlB)]);
    const [hashA, hashB] = await Promise.all([computeHash(bufA), computeHash(bufB)]);
    const maxDistance = HASH_SIZE * HASH_SIZE;
    const distance = hammingDistance(hashA, hashB);
    return Math.round((1 - distance / maxDistance) * 100);
  } catch {
    return null;
  }
}

module.exports = { compareImageUrls };
