const { unsupported } = require('./providerUtils');

const PROVIDER = 'LINKEDIN';

async function lookupProfile() {
  return unsupported(
    PROVIDER,
    'No approved LinkedIn API access for arbitrary public-profile lookup is configured. Use manual candidate input; no LinkedIn request was made.',
  );
}

module.exports = { id: PROVIDER, lookupProfile };