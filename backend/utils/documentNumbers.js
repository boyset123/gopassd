const PassSlipCounter = require('../models/PassSlipCounter');
const TravelOrderCounter = require('../models/TravelOrderCounter');
const { getManilaDateParts } = require('./dateTime');

const SEQ_WIDTH = 5;

function padSeq(seq) {
  return String(seq).padStart(SEQ_WIDTH, '0');
}

function resolveManilaParts(dateValue) {
  const parts = getManilaDateParts(dateValue);
  if (!parts) throw new Error('Invalid date for document number generation.');
  return parts;
}

/**
 * Assign a pass slip tracking number: {seq5}-{yy} (e.g. 00001-26).
 * Counter key is the calendar year (Manila) from the slip date.
 */
async function ensurePassSlipTrackingNo(passSlip) {
  if (passSlip.trackingNo && String(passSlip.trackingNo).trim()) {
    return passSlip.trackingNo;
  }

  const parts = resolveManilaParts(passSlip.date);
  const yyyy = parts.year;
  const yy = String(yyyy).slice(-2);
  const key = String(yyyy);

  const counter = await PassSlipCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const generated = `${padSeq(counter.seq)}-${yy}`;
  passSlip.trackingNo = generated;
  return generated;
}

/**
 * Assign a travel order number: {mm}-{seq5}-{yy} (e.g. 06-00001-26).
 * Counter key is YYYY-MM (Manila) from the order date.
 */
async function ensureTravelOrderNo(travelOrder) {
  if (travelOrder.travelOrderNo && String(travelOrder.travelOrderNo).trim()) {
    return travelOrder.travelOrderNo;
  }

  const parts = resolveManilaParts(travelOrder.date);
  const yyyy = parts.year;
  const mm = String(parts.monthIndex + 1).padStart(2, '0');
  const yy = String(yyyy).slice(-2);
  const key = `${yyyy}-${mm}`;

  const counter = await TravelOrderCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const generated = `${mm}-${padSeq(counter.seq)}-${yy}`;
  travelOrder.travelOrderNo = generated;
  return generated;
}

/**
 * Preview the next pass slip tracking number without incrementing the counter.
 */
async function peekPassSlipTrackingNo(dateValue) {
  const parts = resolveManilaParts(dateValue);
  const yyyy = parts.year;
  const yy = String(yyyy).slice(-2);
  const key = String(yyyy);

  const counter = await PassSlipCounter.findOne({ key }).lean();
  const nextSeq = (counter?.seq ?? 0) + 1;
  return `${padSeq(nextSeq)}-${yy}`;
}

/**
 * Preview the next travel order number without incrementing the counter.
 */
async function peekTravelOrderNo(dateValue) {
  const parts = resolveManilaParts(dateValue);
  const yyyy = parts.year;
  const mm = String(parts.monthIndex + 1).padStart(2, '0');
  const yy = String(yyyy).slice(-2);
  const key = `${yyyy}-${mm}`;

  const counter = await TravelOrderCounter.findOne({ key }).lean();
  const nextSeq = (counter?.seq ?? 0) + 1;
  return `${mm}-${padSeq(nextSeq)}-${yy}`;
}

module.exports = {
  ensurePassSlipTrackingNo,
  ensureTravelOrderNo,
  peekPassSlipTrackingNo,
  peekTravelOrderNo,
  SEQ_WIDTH,
};
