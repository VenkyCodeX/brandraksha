/**
 * Demo seed script — inserts one realistic brand profile for hackathon demos.
 * Run once after configuring backend/.env:
 *   node backend/seed.js
 * Safe to re-run: skips insert if a brand named "Acme Financial" already exists.
 */

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const Brand = require('./models/Brand');

const DEMO_BRAND = {
  brandName: 'Acme Financial',
  websiteUrl: 'https://acmefinancial.com',
  officialDomains: ['acmefinancial.com', 'acmefinancial.in'],
  industry: 'Financial Services',
  description: 'Acme Financial provides retail banking, loans, and investment products across India.',
  region: 'India',
  logoUrl: 'https://placehold.co/128x128/6ea8ff/ffffff?text=AF',
  socialAccounts: [
    {
      platform: 'Instagram',
      username: 'acmefinancial',
      profileUrl: 'https://www.instagram.com/acmefinancial/',
      notes: 'Official account — verified by brand team',
    },
    {
      platform: 'X',
      username: 'acmefinancial',
      profileUrl: 'https://x.com/acmefinancial',
      notes: 'Official account',
    },
    {
      platform: 'LinkedIn',
      username: 'acme-financial',
      profileUrl: 'https://www.linkedin.com/company/acme-financial/',
      notes: 'Official company page',
    },
    {
      platform: 'Facebook',
      username: 'acmefinancialofficial',
      profileUrl: 'https://www.facebook.com/acmefinancialofficial',
      notes: 'Official page',
    },
  ],
  officialApps: [
    {
      appName: 'Acme Financial',
      platform: 'iOS',
      packageId: 'com.acmefinancial.app',
      storeUrl: 'https://apps.apple.com/app/acme-financial/id123456789',
      publisher: 'Acme Financial Ltd',
      iconUrl: 'https://placehold.co/128x128/6ea8ff/ffffff?text=AF',
    },
    {
      appName: 'Acme Financial',
      platform: 'Android',
      packageId: 'com.acmefinancial.app',
      storeUrl: 'https://play.google.com/store/apps/details?id=com.acmefinancial.app',
      publisher: 'Acme Financial Ltd',
      iconUrl: 'https://placehold.co/128x128/6ea8ff/ffffff?text=AF',
    },
  ],
};

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const existing = await Brand.findOne({ brandName: DEMO_BRAND.brandName });
  if (existing) {
    console.log(`Demo brand "${DEMO_BRAND.brandName}" already exists (${existing._id}). Skipping.`);
  } else {
    const brand = await Brand.create(DEMO_BRAND);
    console.log(`Demo brand "${brand.brandName}" created (${brand._id}).`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
  mongoose.disconnect();
});
