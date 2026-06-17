/**
 * Shared audit log helpers for pass slips and travel orders.
 */

const auditLogEntrySchema = {
  action: { type: String, required: true },
  label: { type: String, required: true },
  performedBy: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String },
  role: { type: String },
  timestamp: { type: Date, required: true, default: Date.now },
  details: { type: String },
};

function toIdString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
}

function nameFromRef(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.name) return ref.name;
  return null;
}

function roleFromRef(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.role) return ref.role;
  return null;
}

function appendAuditLog(doc, entry) {
  const timestamp = entry.timestamp || new Date();
  const logEntry = {
    action: entry.action,
    label: entry.label,
    performedBy: entry.performedBy || undefined,
    performedByName: entry.performedByName || undefined,
    role: entry.role || undefined,
    timestamp,
    details: entry.details || undefined,
  };
  if (!doc.auditLog) doc.auditLog = [];
  doc.auditLog.push(logEntry);
  return logEntry;
}

function serializeAuditEvent(entry) {
  return {
    action: entry.action,
    label: entry.label,
    performedBy: entry.performedBy ? toIdString(entry.performedBy) : null,
    performedByName: entry.performedByName || nameFromRef(entry.performedBy) || null,
    role: entry.role || roleFromRef(entry.performedBy) || null,
    timestamp: entry.timestamp,
    details: entry.details || null,
  };
}

function sortByTimestamp(events) {
  return [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function hasAuditAction(slip, action) {
  return (slip.auditLog || []).some((e) => e.action === action);
}

function buildPassSlipAuditTrail(slip) {
  const raw = slip?.toObject ? slip.toObject() : slip;
  if (!raw) return [];

  if (raw.auditLog && raw.auditLog.length > 0) {
    return sortByTimestamp(raw.auditLog.map(serializeAuditEvent));
  }

  const events = [];

  if (raw.createdAt) {
    events.push({
      action: 'submitted',
      label: 'Pass slip submitted',
      performedBy: toIdString(raw.employee),
      performedByName: nameFromRef(raw.employee),
      role: roleFromRef(raw.employee),
      timestamp: raw.createdAt,
      details: null,
    });
  }

  if (raw.approverSignature && (raw.approvedBy || raw.recommendedAt)) {
    const oicFor = nameFromRef(raw.approvedBySignedAsOicFor);
    events.push({
      action: 'recommended',
      label: oicFor ? `Recommended (OIC for ${oicFor})` : 'Recommended by approver',
      performedBy: toIdString(raw.approvedBy),
      performedByName: nameFromRef(raw.approvedBy),
      role: roleFromRef(raw.approvedBy),
      timestamp: raw.recommendedAt || raw.createdAt,
      details: null,
    });
  }

  if (raw.hrApproverSignature && raw.hrApprovedBy) {
    events.push({
      action: 'hr_approved',
      label: 'Approved by Human Resource',
      performedBy: toIdString(raw.hrApprovedBy),
      performedByName: nameFromRef(raw.hrApprovedBy),
      role: roleFromRef(raw.hrApprovedBy) || 'Human Resource Personnel',
      timestamp: raw.hrApprovedAt || raw.createdAt,
      details: raw.trackingNo ? `Tracking No: ${raw.trackingNo}` : null,
    });
  }

  if (raw.departureTime) {
    events.push({
      action: 'verified',
      label: 'Departure verified by Security',
      performedBy: null,
      performedByName: 'Security Personnel',
      role: 'Security Personnel',
      timestamp: raw.departureTime,
      details: null,
    });
  }

  if (raw.arrivalTime) {
    events.push({
      action: 'returned',
      label: 'Return recorded',
      performedBy: null,
      performedByName: 'Security Personnel',
      role: 'Security Personnel',
      timestamp: raw.arrivalTime,
      details: raw.actualMinutesUsed != null ? `Duration: ${raw.actualMinutesUsed} min` : null,
    });
  }

  if (raw.status === 'Cancelled' || raw.cancelledAt || raw.cancellationReason) {
    events.push({
      action: 'cancelled',
      label: 'Pass slip cancelled',
      performedBy: toIdString(raw.cancelledBy),
      performedByName: nameFromRef(raw.cancelledBy) || nameFromRef(raw.employee),
      role: roleFromRef(raw.cancelledBy) || roleFromRef(raw.employee),
      timestamp: raw.cancelledAt || null,
      details: raw.cancellationReason || null,
    });
  }

  if (raw.status === 'Rejected' || raw.rejectionReason) {
    events.push({
      action: 'rejected',
      label: 'Pass slip rejected',
      performedBy: toIdString(raw.approvedBy) || toIdString(raw.hrApprovedBy),
      performedByName: nameFromRef(raw.approvedBy) || nameFromRef(raw.hrApprovedBy),
      role: roleFromRef(raw.approvedBy) || roleFromRef(raw.hrApprovedBy),
      timestamp: raw.rejectedAt || raw.createdAt,
      details: raw.rejectionReason || null,
    });
  }

  if (raw.status === 'Expired' || raw.closureReason) {
    events.push({
      action: 'expired',
      label: 'Pass slip expired',
      performedBy: null,
      performedByName: 'System',
      role: 'System',
      timestamp: raw.expiredAt || null,
      details: raw.closureReason || null,
    });
  }

  return sortByTimestamp(events.filter((e) => e.timestamp));
}

function buildTravelOrderAuditTrail(order) {
  const raw = order?.toObject ? order.toObject() : order;
  if (!raw) return [];

  if (raw.auditLog && raw.auditLog.length > 0) {
    return sortByTimestamp(raw.auditLog.map(serializeAuditEvent));
  }

  const events = [];

  if (raw.createdAt) {
    events.push({
      action: 'submitted',
      label: 'Travel order submitted',
      performedBy: toIdString(raw.employee),
      performedByName: nameFromRef(raw.employee),
      role: roleFromRef(raw.employee) || raw.employeeRole,
      timestamp: raw.createdAt,
      details: null,
    });
  }

  (raw.recommenderSignatures || []).forEach((sig) => {
    const oicFor = nameFromRef(sig.signedAsOicFor);
    events.push({
      action: 'recommended',
      label: oicFor ? `Recommended (OIC for ${oicFor})` : 'Recommended by immediate chief',
      performedBy: toIdString(sig.user),
      performedByName: nameFromRef(sig.user),
      role: roleFromRef(sig.user),
      timestamp: sig.date || raw.createdAt,
      details: null,
    });
  });

  if (raw.presidentSignature && raw.presidentApprovedBy) {
    const oicFor = nameFromRef(raw.presidentSignedAsOicFor);
    events.push({
      action: 'president_approved',
      label: oicFor ? `President approved (OIC for ${oicFor})` : 'Approved by President',
      performedBy: toIdString(raw.presidentApprovedBy),
      performedByName: nameFromRef(raw.presidentApprovedBy),
      role: roleFromRef(raw.presidentApprovedBy) || 'President',
      timestamp: raw.presidentApprovedAt || raw.createdAt,
      details: null,
    });
  }

  if (raw.hrSignature && raw.hrApprovedBy && raw.status === 'For President Approval') {
    events.push({
      action: 'hr_reviewed',
      label: 'Reviewed by Human Resource (sent to President)',
      performedBy: toIdString(raw.hrApprovedBy),
      performedByName: nameFromRef(raw.hrApprovedBy),
      role: roleFromRef(raw.hrApprovedBy) || 'Human Resource Personnel',
      timestamp: raw.hrReviewedAt || raw.createdAt,
      details: null,
    });
  }

  if (raw.approvedBy && raw.status === 'Approved') {
    events.push({
      action: 'hr_approved',
      label: 'Final approval by Human Resource',
      performedBy: toIdString(raw.approvedBy),
      performedByName: nameFromRef(raw.approvedBy),
      role: roleFromRef(raw.approvedBy) || 'Human Resource Personnel',
      timestamp: raw.hrApprovedAt || raw.createdAt,
      details: raw.travelOrderNo ? `Travel Order No: ${raw.travelOrderNo}` : null,
    });
  }

  if (raw.departureTime) {
    events.push({
      action: 'verified',
      label: 'Departure verified',
      performedBy: null,
      performedByName: 'Security Personnel',
      role: 'Security Personnel',
      timestamp: raw.departureTime,
      details: null,
    });
  }

  if (raw.arrivalTime) {
    events.push({
      action: 'returned',
      label: 'Return recorded',
      performedBy: null,
      performedByName: 'Security Personnel',
      role: 'Security Personnel',
      timestamp: raw.arrivalTime,
      details: null,
    });
  }

  if (raw.status === 'Rejected' || raw.rejectionReason) {
    events.push({
      action: 'rejected',
      label: 'Travel order rejected',
      performedBy: null,
      performedByName: null,
      role: null,
      timestamp: raw.rejectedAt || raw.createdAt,
      details: raw.rejectionReason || null,
    });
  }

  if (raw.status === 'Completed') {
    events.push({
      action: 'completed',
      label: 'Travel order completed',
      performedBy: toIdString(raw.employee),
      performedByName: nameFromRef(raw.employee),
      role: roleFromRef(raw.employee),
      timestamp: raw.completedAt || raw.createdAt,
      details: null,
    });
  }

  return sortByTimestamp(events.filter((e) => e.timestamp));
}

function resolvePassSlipCancelledAt(slip) {
  const raw = slip?.toObject ? slip.toObject() : slip;
  if (!raw) return null;
  if (raw.cancelledAt) return raw.cancelledAt;
  const cancelledEvent = (raw.auditLog || [])
    .filter((e) => e.action === 'cancelled' && e.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  return cancelledEvent?.timestamp || null;
}

module.exports = {
  auditLogEntrySchema,
  appendAuditLog,
  serializeAuditEvent,
  buildPassSlipAuditTrail,
  buildTravelOrderAuditTrail,
  resolvePassSlipCancelledAt,
  hasAuditAction,
};
