const mongoose = require('mongoose');

const extensionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  isMainCampus: {
    type: Boolean,
    default: false,
  },
});

const Extension = mongoose.model('Extension', extensionSchema);

module.exports = Extension;
