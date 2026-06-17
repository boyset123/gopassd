const mongoose = require('mongoose');

const passSlipSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  timeOut: {
    type: String,
    required: true,
  },
  estimatedTimeBack: {
    type: String,
    required: true,
  },
  destination: {
    type: String,
    required: true,
  },
  requiredVicinity: {
    type: String,
    default: 'Mati City',
  },
  purpose: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Recommended', 'Approved', 'Rejected', 'Completed', 'Verified', 'Returned', 'Cancelled', 'Expired'],
    default: 'Pending',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // When set, the first-line approver slot was signed by an OIC standing in for this user.
  approvedBySignedAsOicFor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  signature: {
    type: String, // Base64
    required: true,
  },
  approverSignature: {
    type: String, // Base64
  },
  hrApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  hrApproverSignature: {
    type: String, // Base64
  },
  qrCode: {
    type: String, // Base64
  },
  departureTime: {
    type: Date,
  },
  arrivalTime: {
    type: Date,
  },
  overdueMinutes: {
    type: Number,
    default: 0,
  },
  /** Minutes between departure and return scans (set when status becomes Returned). */
  actualMinutesUsed: {
    type: Number,
  },
  latitude: {
    type: Number,
  },
  longitude: {
    type: Number,
  },
  /** Employee / origin coordinates at time of submission (start of route). */
  originLatitude: {
    type: Number,
  },
  originLongitude: {
    type: Number,
  },
  routePolyline: {
    type: String,
  },
  trackingNo: {
    type: String,
  },
  cancellationReason: {
    type: String,
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  cancelledAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
  },
  closureReason: {
    type: String,
  },
  recommendedAt: {
    type: Date,
  },
  hrApprovedAt: {
    type: Date,
  },
  rejectedAt: {
    type: Date,
  },
  expiredAt: {
    type: Date,
  },
  auditLog: [{
    action: { type: String, required: true },
    label: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String },
    role: { type: String },
    timestamp: { type: Date, required: true, default: Date.now },
    details: { type: String },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const PassSlip = mongoose.model('PassSlip', passSlipSchema);

module.exports = PassSlip;
