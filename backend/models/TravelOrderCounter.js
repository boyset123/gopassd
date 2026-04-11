const mongoose = require('mongoose');

// Per-month counter for Travel Order numbers.
// key format: YYYY-MM (e.g. "2026-03")
const travelOrderCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TravelOrderCounter', travelOrderCounterSchema);

