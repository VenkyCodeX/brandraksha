const metaInstagramProvider = require('./metaInstagramProvider');
const xApiProvider = require('./xApiProvider');
const linkedinProvider = require('./linkedinProvider');

const SOCIAL_PROVIDERS = Object.freeze({
  META_INSTAGRAM: metaInstagramProvider,
  X_API: xApiProvider,
  LINKEDIN: linkedinProvider,
});

module.exports = { SOCIAL_PROVIDERS };