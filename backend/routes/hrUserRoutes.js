const express = require('express');
const router = express.Router();
const User = require('../models/User');
const RoleChangeRequest = require('../models/RoleChangeRequest');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { validateRegistrationMetadata } = require('../utils/metadataValidation');

async function notifyUser(io, userId, { message, type, relatedId }) {
  try {
    const user = await User.findById(userId);
    if (!user) return;
    const newNotif = {
      message,
      read: false,
      type,
      relatedId,
      createdAt: new Date(),
    };
    user.notifications.push(newNotif);
    await user.save();
    if (io) {
      io.to(String(userId)).emit('notification', newNotif);
    }
  } catch (err) {
    console.error('notifyUser failed:', err);
  }
}

async function notifyHrUsers(io, message, type, relatedId) {
  try {
    const hrUsers = await User.find({ role: 'Human Resource Personnel', accountStatus: 'active' });
    for (const hr of hrUsers) {
      const newNotif = {
        message,
        read: false,
        type,
        relatedId,
        createdAt: new Date(),
      };
      hr.notifications.push(newNotif);
      await hr.save();
    }
    if (io) {
      io.emit('hr-notification', { message, type, relatedId });
    }
  } catch (err) {
    console.error('notifyHrUsers failed:', err);
  }
}

router.get('/pending-registrations', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const users = await User.find({ accountStatus: 'pending' })
      .select('-password -notifications')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Get pending registrations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/role-change-requests', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const requests = await RoleChangeRequest.find({ status: 'pending' })
      .populate('user', 'name email employeeId phone role faculty campus')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Get role change requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/pending-registrations/:id/approve', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (user.accountStatus !== 'pending') {
      return res.status(400).json({ message: 'User is not pending approval.' });
    }

    const role = req.body.role || user.role;
    const campus = req.body.campus || user.campus;
    const faculty = req.body.faculty !== undefined ? req.body.faculty : user.faculty;

    const meta = await validateRegistrationMetadata({ role, faculty, campus });
    if (!meta.valid) {
      return res.status(400).json({ message: meta.message });
    }

    user.role = meta.role;
    user.campus = meta.campus;
    user.faculty = meta.faculty;
    user.accountStatus = 'active';
    user.rejectionReason = undefined;
    await user.save();

    await notifyUser(req.io, user._id, {
      message: 'Your GoPass DOrSU account has been approved by HR. You may now log in.',
      type: 'account-approved',
      relatedId: user._id,
    });

    res.json(user.toObject({ transform: (_, ret) => { delete ret.password; delete ret.notifications; return ret; } }));
  } catch (error) {
    console.error('Approve registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/pending-registrations/:id/reject', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (user.accountStatus !== 'pending') {
      return res.status(400).json({ message: 'User is not pending approval.' });
    }

    const reason = String(req.body.reason || req.body.rejectionReason || 'Your registration was not approved.').trim();
    user.accountStatus = 'rejected';
    user.rejectionReason = reason;
    await user.save();

    await notifyUser(req.io, user._id, {
      message: `Your registration was rejected: ${reason}`,
      type: 'account-rejected',
      relatedId: user._id,
    });

    res.json({ message: 'Registration rejected.', user: { _id: user._id, accountStatus: user.accountStatus } });
  } catch (error) {
    console.error('Reject registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/role-change-requests/:id/approve', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const request = await RoleChangeRequest.findById(req.params.id).populate('user');
    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending.' });
    }

    const user = await User.findById(request.user._id || request.user);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const meta = await validateRegistrationMetadata({
      role: request.requestedRole,
      faculty: request.requestedFaculty,
      campus: request.requestedExtension,
    });
    if (!meta.valid) {
      return res.status(400).json({ message: meta.message });
    }

    user.role = meta.role;
    user.campus = meta.campus;
    user.faculty = meta.faculty;
    await user.save();

    request.status = 'approved';
    request.reviewedBy = req.user._id;
    request.reviewNote = req.body.reviewNote || '';
    await request.save();

    await notifyUser(req.io, user._id, {
      message: `Your role change request was approved. Your role is now ${meta.role}.`,
      type: 'role-change-approved',
      relatedId: request._id,
    });

    res.json({ request, user: { _id: user._id, role: user.role, campus: user.campus, faculty: user.faculty } });
  } catch (error) {
    console.error('Approve role change error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/role-change-requests/:id/reject', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const request = await RoleChangeRequest.findById(req.params.id).populate('user');
    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending.' });
    }

    const note = String(req.body.reviewNote || req.body.reason || 'Your role change request was not approved.').trim();
    request.status = 'rejected';
    request.reviewedBy = req.user._id;
    request.reviewNote = note;
    await request.save();

    const userId = request.user._id || request.user;
    await notifyUser(req.io, userId, {
      message: `Your role change request was rejected: ${note}`,
      type: 'role-change-rejected',
      relatedId: request._id,
    });

    res.json({ message: 'Role change request rejected.', request });
  } catch (error) {
    console.error('Reject role change error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
