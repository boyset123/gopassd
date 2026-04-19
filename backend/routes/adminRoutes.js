const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to check if user is admin
const auth = async (req, res, next) => {
  try {
    const token = req.header('x-auth-token');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    const user = await User.findById(decoded.userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin login (same as user login but checks for admin role)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists and is admin
    const user = await User.findOne({ email, role: 'admin' });
    if (!user) {
      return res.status(400).json({ message: 'Invalid admin credentials' });
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
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Protected admin route example
router.get('/dashboard', auth, async (req, res) => {
  try {
    // This is a protected route that only admins can access
    res.json({ message: 'Welcome to the admin dashboard' });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Setup Nodemailer transporter
console.log('Attempting to create Nodemailer transporter...');
console.log(`Using Email User: ${process.env.EMAIL_USER ? 'Loaded' : 'NOT LOADED'}`);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
console.log('Nodemailer transporter created.');

// Register a new user and send OTP (admin only)
router.post('/register', auth, async (req, res) => {
  try {
    const { name, email, campus, role, faculty } = req.body;

    if (!name || !email || !campus || !role) {
      return res.status(400).json({ message: 'Please provide all required fields.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(4).toString('hex'); // 8 characters

    const newUser = new User({
      name,
      email,
      campus,
      role,
      faculty,
      password: temporaryPassword, // Set the temporary password
    });

    await newUser.save();

    // Send OTP email
    try {
      console.log(`Attempting to send temporary password email to ${email}...`);
      const mailInfo = await transporter.sendMail({
        from: `"GoPass DOrSU" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your GoPass DOrSU Account Credentials',
        text:
          `Welcome to GoPass DOrSU!\n\n` +
          `You can log in to the mobile app with the following credentials:\n\n` +
          `Email: ${email}\n` +
          `Temporary Password: ${temporaryPassword}\n\n` +
          `You will be required to change this password on your first login.\n`,
        html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>GoPass DOrSU Credentials</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Your GoPass DOrSU login credentials and temporary password.
    </div>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="width:100%;max-width:600px;">
            <tr>
              <td style="padding:6px 8px 16px 8px;">
                <div style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">
                  GoPass DOrSU
                </div>
                <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.25;margin-top:6px;">
                  Your account credentials
                </div>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 18px 14px 18px;box-shadow:0 6px 18px rgba(17,24,39,0.06);">
                <div style="font-size:15px;line-height:1.6;color:#111827;">
                  Hello,<br/>
                  An administrator created your GoPass DOrSU account. Use the credentials below to sign in.
                </div>

                <div style="height:14px;line-height:14px;">&nbsp;</div>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
                  <tr>
                    <td style="padding:14px 14px 6px 14px;">
                      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Email</div>
                      <div style="font-size:16px;font-weight:600;color:#111827;word-break:break-word;">${email}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 14px 14px 14px;">
                      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Temporary Password</div>
                      <div style="font-size:18px;font-weight:700;color:#111827;letter-spacing:0.02em;">${temporaryPassword}</div>
                      <div style="font-size:12px;color:#6b7280;margin-top:8px;">
                        For your security, you’ll be required to change this password on your first login.
                      </div>
                    </td>
                  </tr>
                </table>

                <div style="height:16px;line-height:16px;">&nbsp;</div>

                <div style="font-size:13px;line-height:1.6;color:#374151;">
                  If you didn’t request this account, you can ignore this email.
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 8px 0 8px;">
                <div style="font-size:12px;line-height:1.6;color:#6b7280;">
                  This is an automated message from GoPass DOrSU.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      });
      console.log('Email sent successfully! Message ID:', mailInfo.messageId);
    } catch (emailError) {
      // If email sending fails, roll back user creation
      await User.findByIdAndDelete(newUser._id);
      console.error('Email sending error:', emailError);
      // Provide a more specific error message
      let specificError = 'Failed to send temporary password email due to a server error.';
      if (emailError.code === 'EAUTH') {
        specificError = 'Failed to send temporary password email. The server\'s email credentials (username or password) are incorrect.';
      }
      return res.status(500).json({ message: specificError });
    }

    res.status(201).json({ message: 'User registered successfully. A temporary password has been sent to their email.' });

  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ message: 'Server error during user registration.' });
  }
});

// Get all users with optional filters (admin only)
router.get('/users', auth, async (req, res) => {
  try {
    const { campus, role, faculty } = req.query;
    const filter = {};

    if (campus) filter.campus = campus;
    if (role) filter.role = role;
    if (faculty) filter.faculty = faculty;

    const users = await User.find(filter).select('-password');
    res.json(users);

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a user (admin only)
router.put('/users/:id', auth, async (req, res) => {
  try {
    const { name, email, campus, role, faculty } = req.body;
    const userId = req.params.id;

    const userToUpdate = await User.findById(userId);

    if (!userToUpdate) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent editing of admin accounts
    if (userToUpdate.role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be edited.' });
    }

    // Ensure non-admins cannot be promoted to admin
    if (req.user.role !== 'admin' && req.body.role === 'admin') {
        return res.status(403).json({ message: 'Not authorized to make other users admin.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email, campus, role, faculty },
      { new: true, runValidators: true }
    ).select('-password');

    res.json(updatedUser);

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error during user update.' });
  }
});

// Delete a user (admin only)
router.delete('/users/:id', auth, async (req, res) => {
  try {
    const userId = req.params.id;

    const userToDelete = await User.findById(userId);

    if (!userToDelete) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deletion of admin accounts
    if (userToDelete.role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be deleted.' });
    }

    await User.findByIdAndDelete(userId);

    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error during user deletion.' });
  }
});

module.exports = router;
