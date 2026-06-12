/**
 * One-off: align PassSlipCounter / TravelOrderCounter with existing approved records
 * so new auto-generated numbers continue from the highest sequence already in use.
 *
 * Usage (from repo root):
 *   node backend/scripts/seedDocumentCounters.js
 *   node backend/scripts/seedDocumentCounters.js --dry-run
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const PassSlip = require('../models/PassSlip');
const TravelOrder = require('../models/TravelOrder');
const PassSlipCounter = require('../models/PassSlipCounter');
const TravelOrderCounter = require('../models/TravelOrderCounter');
const { getManilaDateParts } = require('../utils/dateTime');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gopassdorsu';
const dryRun = process.argv.includes('--dry-run');

/** Pass slip: 00001-26 */
const PASS_SLIP_NO_RE = /^(\d+)-(\d{2})$/;

/** Travel order: 06-00001-26 or legacy "06 - 0001 - 26" */
function parseTravelOrderNo(raw) {
  const normalized = String(raw || '').replace(/\s*[-–—]\s*/g, '-').trim();
  const m = normalized.match(/^(\d{2})-(\d+)-(\d{2})$/);
  if (!m) return null;
  return { mm: m[1], seq: parseInt(m[2], 10), yy: m[3] };
}

async function seedPassSlipCounters() {
  const slips = await PassSlip.find({
    trackingNo: { $exists: true, $nin: [null, ''] },
  }).select('date trackingNo');

  const maxByYear = new Map();

  for (const slip of slips) {
    const m = String(slip.trackingNo).trim().match(PASS_SLIP_NO_RE);
    if (!m) continue;

    const seq = parseInt(m[1], 10);
    const yy = m[2];
    const parts = getManilaDateParts(slip.date);
    const yearKey = parts ? String(parts.year) : null;

    // Prefer year from slip date; fall back to 20YY from suffix when date missing.
    const key = yearKey || (yy.length === 2 ? `20${yy}` : null);
    if (!key || !Number.isFinite(seq)) continue;

    const prev = maxByYear.get(key) || 0;
    if (seq > prev) maxByYear.set(key, seq);
  }

  for (const [key, maxSeq] of maxByYear.entries()) {
    const existing = await PassSlipCounter.findOne({ key });
    const current = existing?.seq ?? 0;
    if (maxSeq <= current) {
      console.log(`PassSlipCounter ${key}: already at ${current} (max in DB ${maxSeq}), skip`);
      continue;
    }
    console.log(`PassSlipCounter ${key}: ${current} -> ${maxSeq}`);
    if (!dryRun) {
      await PassSlipCounter.findOneAndUpdate(
        { key },
        { $set: { seq: maxSeq } },
        { upsert: true }
      );
    }
  }
}

async function seedTravelOrderCounters() {
  const orders = await TravelOrder.find({
    travelOrderNo: { $exists: true, $nin: [null, ''] },
  }).select('date travelOrderNo');

  const maxByMonth = new Map();

  for (const order of orders) {
    const parsed = parseTravelOrderNo(order.travelOrderNo);
    if (!parsed) continue;

    const parts = getManilaDateParts(order.date);
    if (!parts) continue;

    const yyyy = parts.year;
    const mm = String(parts.monthIndex + 1).padStart(2, '0');
    const key = `${yyyy}-${mm}`;

    const prev = maxByMonth.get(key) || 0;
    if (parsed.seq > prev) maxByMonth.set(key, parsed.seq);
  }

  for (const [key, maxSeq] of maxByMonth.entries()) {
    const existing = await TravelOrderCounter.findOne({ key });
    const current = existing?.seq ?? 0;
    if (maxSeq <= current) {
      console.log(`TravelOrderCounter ${key}: already at ${current} (max in DB ${maxSeq}), skip`);
      continue;
    }
    console.log(`TravelOrderCounter ${key}: ${current} -> ${maxSeq}`);
    if (!dryRun) {
      await TravelOrderCounter.findOneAndUpdate(
        { key },
        { $set: { seq: maxSeq } },
        { upsert: true }
      );
    }
  }
}

async function main() {
  if (dryRun) console.log('DRY RUN — no writes');

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected');

  await seedPassSlipCounters();
  await seedTravelOrderCounters();

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
