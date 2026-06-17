/**
 * One-time backfill for pass slip audit data.
 *
 * Usage (from backend folder):
 *   node scripts/backfill-pass-slip-audit.js
 *
 * Idempotent: skips slips that already have audit log entries for synthesized actions.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PassSlip = require('../models/PassSlip');
const { appendAuditLog, hasAuditAction } = require('../utils/auditLog');

async function backfillPassSlip(slip) {
  let changed = false;

  if (slip.status === 'Cancelled' && !slip.cancelledAt) {
    const cancelledEvent = (slip.auditLog || []).find((e) => e.action === 'cancelled' && e.timestamp);
    if (cancelledEvent?.timestamp) {
      slip.cancelledAt = cancelledEvent.timestamp;
      changed = true;
    }
  }

  if (!hasAuditAction(slip, 'submitted') && slip.createdAt) {
    appendAuditLog(slip, {
      action: 'submitted',
      label: 'Pass slip submitted',
      performedBy: slip.employee,
      timestamp: slip.createdAt,
    });
    changed = true;
  }

  if (!hasAuditAction(slip, 'recommended') && slip.approverSignature && slip.recommendedAt) {
    appendAuditLog(slip, {
      action: 'recommended',
      label: 'Recommended by approver',
      performedBy: slip.approvedBy,
      timestamp: slip.recommendedAt,
    });
    changed = true;
  }

  if (!hasAuditAction(slip, 'hr_approved') && slip.hrApproverSignature && slip.hrApprovedAt) {
    appendAuditLog(slip, {
      action: 'hr_approved',
      label: 'Approved by Human Resource',
      performedBy: slip.hrApprovedBy,
      timestamp: slip.hrApprovedAt,
      details: slip.trackingNo ? `Tracking No: ${slip.trackingNo}` : undefined,
    });
    changed = true;
  }

  if (!hasAuditAction(slip, 'cancelled') && slip.status === 'Cancelled' && slip.cancelledAt) {
    appendAuditLog(slip, {
      action: 'cancelled',
      label: 'Pass slip cancelled',
      performedBy: slip.cancelledBy,
      timestamp: slip.cancelledAt,
      details: slip.cancellationReason,
    });
    changed = true;
  }

  if (!hasAuditAction(slip, 'rejected') && slip.status === 'Rejected' && slip.rejectedAt) {
    appendAuditLog(slip, {
      action: 'rejected',
      label: 'Pass slip rejected',
      performedBy: slip.approvedBy || slip.hrApprovedBy,
      timestamp: slip.rejectedAt,
      details: slip.rejectionReason,
    });
    changed = true;
  }

  if (!hasAuditAction(slip, 'expired') && slip.status === 'Expired' && slip.expiredAt) {
    appendAuditLog(slip, {
      action: 'expired',
      label: 'Pass slip expired',
      performedByName: 'System',
      role: 'System',
      timestamp: slip.expiredAt,
      details: slip.closureReason,
    });
    changed = true;
  }

  if (!hasAuditAction(slip, 'verified') && slip.departureTime) {
    appendAuditLog(slip, {
      action: 'verified',
      label: 'Departure verified by Security',
      performedByName: 'Security Personnel',
      role: 'Security Personnel',
      timestamp: slip.departureTime,
    });
    changed = true;
  }

  if (!hasAuditAction(slip, 'returned') && slip.arrivalTime) {
    appendAuditLog(slip, {
      action: 'returned',
      label: 'Return recorded',
      performedByName: 'Security Personnel',
      role: 'Security Personnel',
      timestamp: slip.arrivalTime,
      details: slip.actualMinutesUsed != null ? `Duration: ${slip.actualMinutesUsed} min` : undefined,
    });
    changed = true;
  }

  if (changed) {
    await slip.save();
  }
  return changed;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGO_URI or MONGODB_URI');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const slips = await PassSlip.find({});
  let updated = 0;
  for (const slip of slips) {
    if (await backfillPassSlip(slip)) updated += 1;
  }
  console.log(`Backfill complete. Updated ${updated} of ${slips.length} pass slips.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
