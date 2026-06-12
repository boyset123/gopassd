const mongoose = require('mongoose');

// Per-year counter for Pass Slip tracking numbers.
// key format: YYYY (e.g. "2026")
const passSlipCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PassSlipCounter', passSlipCounterSchema);
