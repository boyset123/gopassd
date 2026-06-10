const mongoose = require('mongoose');

const roleChangeRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  currentRole: { type: String, required: true, trim: true },
  currentFaculty: { type: String, trim: true },
  currentExtension: { type: String, required: true, trim: true },
  requestedRole: { type: String, required: true, trim: true },
  requestedFaculty: { type: String, trim: true },
  requestedExtension: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewNote: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

roleChangeRequestSchema.pre('save', function () {
  this.updatedAt = new Date();
});

const RoleChangeRequest = mongoose.model('RoleChangeRequest', roleChangeRequestSchema);

module.exports = RoleChangeRequest;
