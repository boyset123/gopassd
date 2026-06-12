const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const User = require('../models/User');
const PassSlip = require('../models/PassSlip');
const TravelOrder = require('../models/TravelOrder');
const RoleChangeRequest = require('../models/RoleChangeRequest');
const auth = require('../middleware/auth');
const { isConfigured, uploadProfileImage } = require('../lib/cloudinaryProfile');
const {
  isOicCapableRole,
  isUserOnTravel,
  getEffectiveSigner,
  buildPrimaryCandidateFilter,
  getRankBelowRoles,
  getActiveOicForRoles,
} = require('../utils/oic');
const { serializePassSlipBalance } = require('../utils/passSlipBalanceState');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 5 },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('File upload only supports the following filetypes - ' + filetypes));
  },
});

function requireCloudinaryProfileUpload(req, res, next) {
  if (!isConfigured()) {
    return res.status(503).json({
      message:
        'Profile picture upload is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
  }
  next();
}

const { sendEmail, isEmailConfigured } = require('../utils/sendEmail');

function getWebResetBaseUrl(req) {
  const explicit =
    process.env.WEB_RESET_URL_BASE ||
    process.env.WEB_APP_URL ||
    process.env.WEB_URL;

  if (explicit && String(explicit).trim()) {
    return String(explicit).replace(/\/$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

const { isValidDorsuEmail, dorsuEmailErrorMessage, validatePhone } = require('../utils/dorsuEmail');
const { validateRegistrationMetadata } = require('../utils/metadataValidation');

async function notifyHrUsers(io, message, type, relatedId) {
  try {
    const hrUsers = await User.find({ role: 'Human Resource Personnel', accountStatus: 'active' });
    for (const hr of hrUsers) {
      hr.notifications.push({
        message,
        read: false,
        type,
        relatedId,
        createdAt: new Date(),
      });
      await hr.save();
    }
    if (io) {
      io.emit('hr-notification', { message, type, relatedId });
    }
  } catch (err) {
    console.error('notifyHrUsers failed:', err);
  }
}

async function notifyUserInApp(io, userId, { message, type, relatedId }) {
  try {
    const target = await User.findById(userId);
    if (!target) return;

    const newNotif = target.notifications.create({
      message,
      read: false,
      type,
      relatedId,
      createdAt: new Date(),
    });
    target.notifications.push(newNotif);
    await target.save();

    const payload = newNotif.toObject ? newNotif.toObject() : newNotif;
    if (io) {
      io.emit('newNotification', { userId: String(userId), notification: payload });
    }
  } catch (err) {
    console.error('notifyUserInApp failed:', err);
  }
}

// Public self-registration
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      employeeId,
      phone,
      campus,
      role,
      faculty,
    } = req.body;

    if (!name || !email || !password || !employeeId || !phone || !campus || !role) {
      return res.status(400).json({ message: 'Please provide all required fields.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!isValidDorsuEmail(normalizedEmail)) {
      return res.status(400).json({ message: dorsuEmailErrorMessage() });
    }

    const phoneResult = validatePhone(phone);
    if (!phoneResult.valid) {
      return res.status(400).json({ message: phoneResult.message });
    }

    const meta = await validateRegistrationMetadata({ role, faculty, campus });
    if (!meta.valid) {
      return res.status(400).json({ message: meta.message });
    }

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    const existingEmployeeId = await User.findOne({ employeeId: String(employeeId).trim() });
    if (existingEmployeeId) {
      return res.status(400).json({ message: 'Employee ID is already registered.' });
    }

    const newUser = new User({
      name: String(name).trim(),
      email: normalizedEmail,
      password,
      employeeId: String(employeeId).trim(),
      phone: phoneResult.normalized,
      campus: meta.campus,
      role: meta.role,
      faculty: meta.faculty,
      accountStatus: 'pending',
    });

    await newUser.save();

    await notifyHrUsers(req.io, `New registration pending approval: ${newUser.name} (${newUser.email})`, 'pending-registration', newUser._id);

    res.status(201).json({
      message:
        'Registration submitted successfully. HR will review your account. You will receive an email when your registration is approved or rejected.',
    });
  } catch (error) {
    console.error('Self-registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email or Employee ID already exists.' });
    }
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.accountStatus === 'pending') {
      return res.status(403).json({ message: 'Your account is pending HR approval. You will be notified once approved.' });
    }

    if (user.accountStatus === 'rejected') {
      const reason = user.rejectionReason ? ` Reason: ${user.rejectionReason}` : '';
      return res.status(403).json({ message: `Your account registration was rejected.${reason}` });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your_jwt_secret_key_here',
      { expiresIn: '30d' }
    );

    const activeOicForRoles = await getActiveOicForRoles(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        campus: user.campus,
        role: user.role,
        faculty: user.faculty,
        createdAt: user.createdAt,
        ...serializePassSlipBalance(user),
        activeOicForRoles,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Forgot password: only registered emails can request a reset link.
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'This email is not registered.' });
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = expiresAt;
    await user.save();

    if (isEmailConfigured()) {
      const resetBaseUrl = getWebResetBaseUrl(req);
      const resetUrl = `${resetBaseUrl}/api/users/reset-password/${plainToken}`;

      await sendEmail({
        to: email,
        subject: 'Reset your GoPass DOrSU password',
        text:
          'You requested a password reset.\n\n' +
          `Open this link to set a new password: ${resetUrl}\n\n` +
          'This link expires in 1 hour. If you did not request this, ignore this email.',
        html: `
          <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.6">
            <h2 style="margin:0 0 12px 0;">Reset your GoPass DOrSU password</h2>
            <p style="margin:0 0 14px 0;">You requested a password reset.</p>
            <p style="margin:0 0 18px 0;">
              <a href="${resetUrl}" style="background:#011a6b;color:#ffffff;padding:10px 14px;border-radius:8px;text-decoration:none;display:inline-block;">
                Set new password
              </a>
            </p>
            <p style="margin:0 0 10px 0;">This link expires in 1 hour.</p>
            <p style="margin:0;color:#6b7280;">If you did not request this, you can ignore this email.</p>
          </div>
        `,
      });
    } else {
      console.warn('Forgot password email skipped: EMAIL_USER / EMAIL_PASS not configured.');
    }

    return res.json({ message: 'Password reset link sent successfully.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Reset password form served from backend so email link always resolves.
router.get('/reset-password/:token', async (req, res) => {
  const token = String(req.params?.token || '').trim();
  if (!token) {
    return res.status(400).type('text').send('Invalid or missing reset token.');
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Password - GoPass DOrSU</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 24px; }
      .card { max-width: 420px; margin: 40px auto; background: #fff; padding: 22px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
      h1 { font-size: 22px; margin: 0 0 10px 0; color: #011a6b; }
      p { color: #4b5563; margin: 0 0 16px 0; }
      input { width: 100%; box-sizing: border-box; padding: 12px; margin-bottom: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
      button { width: 100%; padding: 12px; border: none; border-radius: 8px; background: #011a6b; color: #fff; font-weight: 600; cursor: pointer; }
      #message { margin-top: 14px; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Set New Password</h1>
      <p>Enter your new password below.</p>
      <form id="resetForm">
        <input id="password" type="password" placeholder="New password" minlength="6" required />
        <input id="confirmPassword" type="password" placeholder="Confirm new password" minlength="6" required />
        <button type="submit">Update Password</button>
      </form>
      <div id="message"></div>
    </div>
    <script>
      const form = document.getElementById('resetForm');
      const message = document.getElementById('message');
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        if (password !== confirmPassword) {
          message.style.color = '#dc2626';
          message.textContent = 'Passwords do not match.';
          return;
        }
        try {
          const res = await fetch('/api/users/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: '${token}', password })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Failed to reset password.');
          message.style.color = '#059669';
          message.textContent = 'Password updated successfully. You can now sign in.';
          form.reset();
        } catch (err) {
          message.style.color = '#dc2626';
          message.textContent = err.message || 'Failed to reset password.';
        }
      });
    </script>
  </body>
</html>`;

  return res.type('html').send(html);
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token.' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ message: 'Password reset successful.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password')
      .populate('oicPrimary', 'name role faculty');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const onTravelStatus = await isUserOnTravel(user);
    const activeOicForRoles = await getActiveOicForRoles(user._id);
    res.json({
        id: user._id,
        name: user.name,
        email: user.email,
        campus: user.campus,
        role: user.role,
        faculty: user.faculty,
        createdAt: user.createdAt,
        profilePicture: user.profilePicture,
        ...serializePassSlipBalance(user),
        oicPrimary: user.oicPrimary || null,
        onTravelManual: !!user.onTravelManual,
        onTravelManualUntil: user.onTravelManualUntil || null,
        onTravel: !!onTravelStatus.onTravel,
        onTravelReason: onTravelStatus.reason || null,
        canAssignOic: isOicCapableRole(user.role),
        activeOicForRoles,
        employeeId: user.employeeId,
        phone: user.phone,
        accountStatus: user.accountStatus,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me/role-change-request', auth, async (req, res) => {
  try {
    const request = await RoleChangeRequest.findOne({
      user: req.user.userId,
      status: 'pending',
    }).sort({ createdAt: -1 });
    res.json(request || null);
  } catch (error) {
    console.error('Get role change request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/me/role-change-request', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot request role changes.' });
    }

    const existing = await RoleChangeRequest.findOne({ user: user._id, status: 'pending' });
    if (existing) {
      return res.status(400).json({ message: 'You already have a pending role change request.' });
    }

    const { requestedRole, requestedFaculty, requestedExtension } = req.body;
    if (!requestedRole || !requestedExtension) {
      return res.status(400).json({ message: 'Requested role and campus / extension are required.' });
    }

    const meta = await validateRegistrationMetadata({
      role: requestedRole,
      faculty: requestedFaculty,
      campus: requestedExtension,
    });
    if (!meta.valid) {
      return res.status(400).json({ message: meta.message });
    }

    if (
      user.role === meta.role &&
      user.campus === meta.campus &&
      (user.faculty || '') === (meta.faculty || '')
    ) {
      return res.status(400).json({ message: 'Requested role and assignment match your current profile.' });
    }

    const request = await RoleChangeRequest.create({
      user: user._id,
      currentRole: user.role,
      currentFaculty: user.faculty,
      currentExtension: user.campus,
      requestedRole: meta.role,
      requestedFaculty: meta.faculty,
      requestedExtension: meta.campus,
      status: 'pending',
    });

    await notifyHrUsers(
      req.io,
      `Role change request from ${user.name}: ${user.role} → ${meta.role}`,
      'role-change-request',
      request._id
    );

    res.status(201).json(request);
  } catch (error) {
    console.error('Create role change request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload profile picture (stored on Cloudinary; DB holds secure_url)
router.post(
  '/me/profile-picture',
  auth,
  requireCloudinaryProfileUpload,
  upload.single('profilePicture'),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'No file uploaded.' });
      }

      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const result = await uploadProfileImage(req.file.buffer, String(req.user.userId));
      user.profilePicture = result.secure_url;
      await user.save();

      res.json({
        message: 'Profile picture uploaded successfully',
        filePath: user.profilePicture,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          campus: user.campus,
          role: user.role,
          faculty: user.faculty,
          createdAt: user.createdAt,
          profilePicture: user.profilePicture,
          ...serializePassSlipBalance(user),
        },
      });
    } catch (error) {
      console.error('Profile picture upload error:', error);
      res.status(500).json({ message: 'Server error during file upload' });
    }
  },
  (error, req, res, next) => {
    res.status(400).json({ message: error.message || 'Upload failed' });
  }
);

// Update user's name
router.put('/me/name', auth, async (req, res) => {
  try {
    const { newName } = req.body;
    if (!newName || typeof newName !== 'string') {
      return res.status(400).json({ message: 'A valid name is required.' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = newName;
    await user.save();

    res.json({
      message: 'Name updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        campus: user.campus,
        role: user.role,
        faculty: user.faculty,
        createdAt: user.createdAt,
        profilePicture: user.profilePicture,
        ...serializePassSlipBalance(user),
      }
    });
  } catch (error) {
    console.error('Update name error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change user's password
router.put('/me/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both current and new passwords are required.' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect current password.' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update FCM token
router.put('/me/fcm-token', auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ message: 'FCM token is required.' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.fcmToken = fcmToken;
    await user.save();

    res.json({ message: 'FCM token updated successfully' });
  } catch (error) {
    console.error('Update FCM token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Find Program Head by Faculty
router.get('/program-head-by-faculty/:faculty', async (req, res) => {
  try {
    const { faculty } = req.params;
    const programHead = await User.findOne({
      faculty: faculty,
      role: 'Program Head'
    }).select('-password');

    if (!programHead) {
      return res.status(404).json({ message: 'Program Head not found for this faculty.' });
    }

    res.json(programHead);
  } catch (error) {
    console.error('Find Program Head error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Find Faculty Dean by Faculty
router.get('/dean-by-faculty/:faculty', async (req, res) => {
  try {
    const { faculty } = req.params;
    const facultyDean = await User.findOne({
      faculty: faculty,
      role: 'Faculty Dean'
    }).select('-password');

    if (!facultyDean) {
      return res.status(404).json({ message: 'Faculty Dean not found for this faculty.' });
    }

    res.json(facultyDean);
  } catch (error) {
    console.error('Find Faculty Dean error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Find President
router.get('/president', async (req, res) => {
  try {
    const president = await User.findOne({ role: 'President' }).select('-password');
    if (!president) {
      return res.status(404).json({ message: 'President not found.' });
    }
    res.json(president);
  } catch (error) {
    console.error('Find President error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Find approver for current user
router.get('/me/approver', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let approver;
    if (user.role === 'Faculty Staff' && user.faculty) {
      approver = await User.findOne({ faculty: user.faculty, role: 'Program Head' }).select('-password');
      if (!approver) return res.status(404).json({ message: 'Program Head not found for this faculty.' });
    } else if (user.role === 'Program Head' && user.faculty) {
      approver = await User.findOne({ faculty: user.faculty, role: 'Faculty Dean' }).select('-password');
      if (!approver) return res.status(404).json({ message: 'Faculty Dean not found for this faculty.' });
    } else if (user.role === 'Faculty Dean') {
      approver = await User.findOne({ role: 'President' }).select('-password');
      if (!approver) return res.status(404).json({ message: 'President not found.' });
    } else {
      return res.status(404).json({ message: 'No specific approver found for this user role.' });
    }

    res.json(approver);

  } catch (error) {
    console.error('Find Approver error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List eligible OIC candidates for the signed-in user.
router.get('/me/oic-candidates', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!isOicCapableRole(user.role)) {
      return res.status(403).json({ message: 'Your role cannot assign an OIC.' });
    }

    const filter = buildPrimaryCandidateFilter(user);
    if (!filter) {
      return res.status(400).json({ message: 'No rank-below pool defined for your role.' });
    }

    const candidates = await User.find(filter)
      .select('_id name role faculty campus profilePicture')
      .sort({ name: 1 })
      .lean();

    res.json({
      rankBelowRoles: getRankBelowRoles(user.role),
      candidates,
    });
  } catch (error) {
    console.error('Get OIC candidates error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update OIC assignments for the signed-in user.
router.put('/me/oic', auth, async (req, res) => {
  try {
    const { oicPrimary } = req.body || {};

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!isOicCapableRole(user.role)) {
      return res.status(403).json({ message: 'Your role cannot assign an OIC.' });
    }

    const previousOicId = user.oicPrimary ? user.oicPrimary.toString() : null;
    let newOicId = previousOicId;

    // Validate Primary OIC: must be in rank-below pool (faculty-scoped for Dean/Head)
    if (oicPrimary === null || oicPrimary === '') {
      user.oicPrimary = null;
      newOicId = null;
    } else if (oicPrimary !== undefined) {
      const candidate = await User.findById(oicPrimary).select('_id role faculty').lean();
      if (!candidate) {
        return res.status(400).json({ message: 'Primary OIC user not found.' });
      }
      const allowedRoles = getRankBelowRoles(user.role);
      if (!allowedRoles.includes(candidate.role)) {
        return res.status(400).json({
          message: `Primary OIC must be one of: ${allowedRoles.join(', ')}.`,
        });
      }
      if (
        (user.role === 'Faculty Dean' || user.role === 'Program Head') &&
        user.faculty &&
        candidate.faculty !== user.faculty
      ) {
        return res.status(400).json({ message: 'Primary OIC must belong to the same faculty.' });
      }
      if (candidate._id.toString() === user._id.toString()) {
        return res.status(400).json({ message: 'You cannot assign yourself as OIC.' });
      }
      user.oicPrimary = candidate._id;
      newOicId = candidate._id.toString();
    }

    await user.save();

    if (newOicId && newOicId !== previousOicId) {
      await notifyUserInApp(req.io, newOicId, {
        message: `${user.name} (${user.role}) assigned you as their Primary Officer-In-Charge (OIC). You may sign documents on their behalf when they are on travel.`,
        type: 'OIC',
        relatedId: user._id,
      });
    }

    if (previousOicId && previousOicId !== newOicId) {
      await notifyUserInApp(req.io, previousOicId, {
        message: `You are no longer the Primary OIC for ${user.name} (${user.role}).`,
        type: 'OIC',
        relatedId: user._id,
      });
    }

    const refreshed = await User.findById(user._id)
      .select('_id name role oicPrimary')
      .populate('oicPrimary', 'name role faculty')
      .lean();

    res.json({
      message: 'OIC assignments updated.',
      oicPrimary: refreshed.oicPrimary || null,
    });
  } catch (error) {
    console.error('Update OIC error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle/set the user's manual on-travel status.
router.put('/me/on-travel', auth, async (req, res) => {
  try {
    const { onTravelManual, onTravelManualUntil } = req.body || {};

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!isOicCapableRole(user.role)) {
      return res.status(403).json({ message: 'Your role cannot toggle on-travel status.' });
    }

    user.onTravelManual = !!onTravelManual;
    if (onTravelManualUntil === null || onTravelManualUntil === '') {
      user.onTravelManualUntil = null;
    } else if (onTravelManualUntil !== undefined) {
      const parsed = new Date(onTravelManualUntil);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'Invalid onTravelManualUntil date.' });
      }
      user.onTravelManualUntil = parsed;
    }
    if (!user.onTravelManual) {
      user.onTravelManualUntil = null;
    }

    await user.save();

    const status = await isUserOnTravel(user);
    res.json({
      message: 'On-travel status updated.',
      onTravelManual: !!user.onTravelManual,
      onTravelManualUntil: user.onTravelManualUntil || null,
      onTravel: !!status.onTravel,
      onTravelReason: status.reason || null,
    });
  } catch (error) {
    console.error('Update on-travel error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Resolve who currently signs on behalf of the given user (with OIC delegation).
router.get('/:id/effective-signer', auth, async (req, res) => {
  try {
    const resolution = await getEffectiveSigner(req.params.id);
    if (!resolution) return res.status(404).json({ message: 'User not found' });

    res.json({
      originalId: resolution.originalId,
      original: resolution.original
        ? { _id: resolution.original._id, name: resolution.original.name, role: resolution.original.role }
        : null,
      signerId: resolution.signerId,
      signer: resolution.signer
        ? { _id: resolution.signer._id, name: resolution.signer.name, role: resolution.signer.role }
        : null,
      viaOic: resolution.viaOic,
      noDelegateAvailable: !!resolution.noDelegateAvailable,
    });
  } catch (error) {
    console.error('Effective signer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Aggregated activity feed for profile view
router.get('/me/activity', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);

    const user = await User.findById(userId).select('notifications');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const entries = [];

    for (const n of user.notifications || []) {
      entries.push({
        id: `notif-${n._id}`,
        category: 'notification',
        title: n.type || 'Notification',
        detail: n.message,
        createdAt: n.createdAt,
        relatedId: n.relatedId ? String(n.relatedId) : undefined,
      });
    }

    const roleRequests = await RoleChangeRequest.find({ user: userId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    for (const r of roleRequests) {
      const statusLabel =
        r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
      entries.push({
        id: `role-${r._id}`,
        category: 'role-change',
        title: `Role change ${statusLabel}`,
        detail: `Requested ${r.requestedRole}${r.requestedFaculty ? ` (${r.requestedFaculty})` : ''}`,
        createdAt: r.updatedAt || r.createdAt,
        relatedId: String(r._id),
      });
    }

    const [slips, orders] = await Promise.all([
      PassSlip.find({ employee: userId })
        .sort({ createdAt: -1 })
        .limit(15)
        .select('destination purpose status date createdAt')
        .lean(),
      TravelOrder.find({ employee: userId })
        .sort({ createdAt: -1 })
        .limit(15)
        .select('to purpose status date createdAt')
        .lean(),
    ]);

    for (const s of slips) {
      entries.push({
        id: `slip-${s._id}`,
        category: 'submission',
        title: 'Pass Slip',
        detail: `${s.status} — ${s.destination || 'No destination'}`,
        createdAt: s.createdAt,
        relatedId: String(s._id),
      });
    }

    for (const o of orders) {
      entries.push({
        id: `order-${o._id}`,
        category: 'submission',
        title: 'Travel Order',
        detail: `${o.status} — ${o.to || 'No destination'}`,
        createdAt: o.createdAt,
        relatedId: String(o._id),
      });
    }

    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(entries.slice(skip, skip + limit));
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user notifications
router.get('/me/notifications', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('notifications');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Sort notifications by most recent
    const sortedNotifications = user.notifications.sort((a, b) => b.createdAt - a.createdAt);
    res.json(sortedNotifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark notifications as read
router.put('/me/notifications/mark-read', auth, async (req, res) => {
  try {
    const { notificationId } = req.body; // Can be a single ID or 'all'
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (notificationId === 'all') {
      user.notifications.forEach(notif => notif.read = true);
    } else {
      const notification = user.notifications.id(notificationId);
      if (notification) {
        notification.read = true;
      }
    }

    await user.save();
    res.json({ message: 'Notifications marked as read.' });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a notification
router.delete('/me/notifications/:notificationId', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the index of the notification to remove
    const notificationIndex = user.notifications.findIndex(
      (notif) => notif._id.toString() === notificationId
    );

    if (notificationIndex === -1) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Remove the notification from the array
    user.notifications.splice(notificationIndex, 1);

    await user.save();
    res.json({ message: 'Notification deleted successfully.' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete all notifications
router.delete('/me/notifications', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.notifications = [];
    await user.save();
    res.json({ message: 'All notifications deleted successfully.' });
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users with optional filters
router.get('/', async (req, res) => {
  try {
    const { faculty, campus, role } = req.query;
    const filter = {};
    if (faculty) filter.faculty = faculty;
    if (campus) filter.campus = campus;
    if (role) {
      if (Array.isArray(role)) {
        filter.role = { $in: role };
      } else {
        filter.role = role;
      }
    }

    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
