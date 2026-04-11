const mongoose = require('mongoose');

const travelOrderSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  signature: {
    type: String, // Base64
  },
  approverSignature: {
    type: String, // Base64
  },
  recommenderSignatures: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    signature: String,
    date: { type: Date, default: Date.now }
  }],
  hrSignature: {
    type: String, // Base64
  },
  hrApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  travelOrderNoSignature: {
    type: String, // Base64
  },
  departureSignature: {
    type: String, // Base64
  },
  arrivalSignature: {
    type: String, // Base64
  },
  presidentSignature: {
    type: String, // Base64
  },
  travelOrderNo: { type: String },
  date: { type: Date, required: true },
  address: { type: String, required: true },
  employeeAddress: { type: String },
  salary: { type: String, required: true },
  to: { type: String, required: true },
  purpose: { type: String, required: true },
  departureDate: { type: Date, required: true },
  arrivalDate: { type: Date, required: true },
  additionalInfo: { type: String },
  timeOut: { type: String },
  status: { type: String, enum: ['Pending', 'Recommended', 'For HR Approval', 'For President Approval', 'President Approved', 'Approved', 'Rejected', 'Completed', 'Verified', 'Returned'], default: 'Pending' },
  recommendedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  recommendersWhoApproved: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  presidentApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  qrCode: { type: String },
  departureTime: { type: Date },
  arrivalTime: { type: Date },
  latitude: { type: Number },
  longitude: { type: Number },
  routePolyline: { type: String },
  participants: [{ type: String }],
  document: { data: Buffer, contentType: String, name: String },
  rejectionReason: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const TravelOrder = mongoose.model('TravelOrder', travelOrderSchema);

module.exports = TravelOrder;
