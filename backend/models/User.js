const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  type: { type: String },
  relatedId: { type: mongoose.Schema.Types.ObjectId }
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: false // Not required for initial OTP setup
  },
  role: {
    type: String,
    enum: [
      'Office Staff',
      'Faculty Staff',
      'Program Head',
      'Human Resource Personnel',
      'Office Records',
      'Faculty Dean',
      'Security Personnel',
      'admin',
      'President'
    ],
    required: true
  },
  campus: {
    type: String,
    required: true,
    trim: true
  },
  faculty: {
    type: String,
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  profilePicture: {
    type: String,
    default: '' // Default to an empty string
  },
  passSlipMinutes: {
    type: Number,
    default: 120
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  fcmToken: {
    type: String,
  },
  notifications: [notificationSchema],
  resetPasswordToken: String,
  resetPasswordExpires: Date
});

// Hash password before saving
userSchema.pre('save', async function() {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password') || !this.password) {
    return;
  }
  // Mongoose async pre-hooks handle errors automatically when you throw them.
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
