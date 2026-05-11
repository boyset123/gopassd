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
  purpose: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Recommended', 'Approved', 'Rejected', 'Completed', 'Verified', 'Returned', 'Cancelled'],
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
  latitude: {
    type: Number,
  },
  longitude: {
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
  rejectionReason: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const PassSlip = mongoose.model('PassSlip', passSlipSchema);

module.exports = PassSlip;
