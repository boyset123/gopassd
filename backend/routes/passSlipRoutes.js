const express = require('express');
const router = express.Router();
const PassSlip = require('../models/PassSlip');
const auth = require('../middleware/auth'); // Assuming you have an auth middleware
const authorize = require('../middleware/authorize');
const QRCode = require('qrcode');
const admin = require('firebase-admin');
const { parseMeridiemTimeToDate, parseMeridiemTimeToMillisOfDay } = require('../utils/dateTime');

// Create a new pass slip
const User = require('../models/User');

router.post('/', auth, async (req, res) => {
  try {
    const { date, timeOut, estimatedTimeBack, destination, purpose, signature, latitude, longitude, routePolyline } = req.body;

    // Enforce office hours in PH local time to avoid server-timezone mismatches.
    const now = new Date();
    const phHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        hour12: false,
      }).format(now)
    );
    // Office hours are 8:00 AM to 5:00 PM (requesting allowed up to 4:59:59 PM).
    if (Number.isNaN(phHour) || phHour < 8 || phHour >= 17) {
      return res.status(400).json({ message: 'Pass slip requests are only allowed during office hours (8:00 AM to 5:00 PM).' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.role === 'Security Personnel') {
      return res.status(403).json({ message: 'Security personnel are not allowed to create pass slips.' });
    }

    let approverId;
    if (user.role === 'Program Head') {
      const dean = await User.findOne({ role: 'Faculty Dean', faculty: user.faculty });
      if (!dean) {
        return res.status(404).json({ message: 'Faculty Dean for your faculty not found.' });
      }
      approverId = dean._id;
    } else {
      approverId = req.body.approvedBy;
    }

    if (!approverId) {
      return res.status(400).json({ message: 'Approver could not be determined.' });
    }

    const startTime = parseMeridiemTimeToDate(timeOut, date);
    const endTime = parseMeridiemTimeToDate(estimatedTimeBack, date);

    if (!startTime || !endTime || endTime < startTime) {
        return res.status(400).json({ message: 'Invalid time format or range.' });
    }

    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000; // duration in minutes

    if (user.passSlipMinutes < durationMinutes) {
      return res.status(400).json({ message: `Insufficient pass slip minutes. You have ${user.passSlipMinutes} minutes remaining.` });
    }

    const newPassSlip = new PassSlip({
      date,
      employee: req.user.userId,
      timeOut,
      estimatedTimeBack,
      destination,
      purpose,
      approvedBy: approverId,
      signature,
      latitude,
      longitude,
      routePolyline
    });

    const passSlip = await newPassSlip.save();

    // --- In-App Notification Logic ---
    try {
      const approver = await User.findById(approverId);
      if (approver) {
        const newNotification = {
          message: `${user.name} has submitted a new pass slip for your approval.`,
          type: 'PassSlip',
          relatedId: passSlip._id,
        };
        approver.notifications.push(newNotification);
        await approver.save();
        console.log(`In-app notification created for ${approver.role}.`);

        const lastNotif = approver.notifications[approver.notifications.length - 1];
        const notifPayload = lastNotif.toObject ? lastNotif.toObject() : lastNotif;
        req.io.emit('newNotification', { userId: approver._id.toString(), notification: notifPayload });

        // --- Real-time Update via Socket.IO ---
        req.io.emit('newPassSlip', { passSlip, approverId: approver._id });
      }
    } catch (notificationError) {
      console.error('Error creating in-app notification:', notificationError);
      // Do not block the main response for a notification error
    }

    res.status(201).json(passSlip);
  } catch (error) {
    console.error('Error creating pass slip:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all pending pass slips (for Program Head)
router.get('/pending', [auth, authorize('Program Head')], async (req, res) => {
  try {
    const pendingSlips = await PassSlip.find({ approvedBy: req.user.userId, status: 'Pending' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name');
    res.json(pendingSlips);
  } catch (error) {
    console.error('Error fetching pending pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all pending pass slips (for Faculty Dean)
router.get('/dean-pending', [auth, authorize('Faculty Dean')], async (req, res) => {
  try {
    const pendingSlips = await PassSlip.find({ approvedBy: req.user.userId, status: 'Pending' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name');
    res.json(pendingSlips);
  } catch (error) {
    console.error('Error fetching pending pass slips for dean:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all pending pass slips (for President)
router.get('/president-pending', [auth, authorize('President')], async (req, res) => {
  try {
    const pendingSlips = await PassSlip.find({ approvedBy: req.user.userId, status: 'Pending' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name');
    res.json(pendingSlips);
  } catch (error) {
    console.error('Error fetching pending pass slips for president:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update pass slip status (for Program Head and HR)
router.put('/:id/status', [auth, authorize('Program Head', 'Faculty Dean', 'President', 'Human Resource Personnel')], async (req, res) => {
  try {
    const { status, approverSignature, trackingNo, rejectionReason } = req.body;
    
    // Program Heads can only approve (for HR review) or reject
    // HR can approve (final approval), complete, or reject
    if (['Program Head', 'Faculty Dean', 'President'].includes(req.user.role)) {
      if (!['Recommended', 'Rejected'].includes(status)) {
        return res.status(400).json({ message: 'Approvers can only recommend or reject pass slips.' });
      }
    } else if (req.user.role === 'Human Resource Personnel') {
      if (!['Approved', 'Completed', 'Rejected'].includes(status)) {
        return res.status(400).json({ message: 'HR can only approve, complete, or reject pass slips.' });
      }
    }

    const passSlip = await PassSlip.findById(req.params.id);
    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    // Validate status transitions
    if (['Program Head', 'Faculty Dean', 'President'].includes(req.user.role) && status === 'Recommended') {
      if (passSlip.status !== 'Pending') {
        return res.status(400).json({ message: 'Approvers can only recommend pending pass slips.' });
      }
      passSlip.status = 'Recommended';
      passSlip.approvedBy = req.user.userId;
      passSlip.approverSignature = approverSignature;
    } else if (req.user.role === 'Human Resource Personnel') {
      if (status === 'Approved' && passSlip.status !== 'Recommended') {
        return res.status(400).json({ message: 'HR can only approve pass slips that have been recommended by the Program Head.' });
      }
      if (status === 'Approved') {
        const user = await User.findById(passSlip.employee);
        if (!user) {
          return res.status(404).json({ message: 'Employee not found.' });
        }

        const startTime = parseMeridiemTimeToDate(passSlip.timeOut, passSlip.date);
        const endTime = parseMeridiemTimeToDate(passSlip.estimatedTimeBack, passSlip.date);

        if (!startTime || !endTime || endTime < startTime) {
            return res.status(400).json({ message: 'Invalid time format or range on the pass slip.' });
        }

        const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;

        if (user.passSlipMinutes < durationMinutes) {
          return res.status(400).json({ message: `Insufficient pass slip minutes. The user has ${user.passSlipMinutes} minutes remaining.` });
        }

        user.passSlipMinutes -= durationMinutes;
        await user.save();

        passSlip.status = 'Approved';
        passSlip.hrApprovedBy = req.user.userId;
        passSlip.hrApproverSignature = approverSignature;
        passSlip.trackingNo = trackingNo; // Save the tracking number
        // Generate QR Code with full details for guard to scan and view without API
        const approvedByUser = await User.findById(passSlip.approvedBy).select('name').lean();
        const qrPayload = {
          id: passSlip._id.toString(),
          type: 'PassSlip',
          status: passSlip.status,
          date: passSlip.date,
          timeOut: passSlip.timeOut,
          estimatedTimeBack: passSlip.estimatedTimeBack,
          destination: passSlip.destination,
          purpose: passSlip.purpose,
          trackingNo: passSlip.trackingNo,
          employee: { name: user.name, role: user.role },
          approvedBy: { name: approvedByUser?.name },
          hrApprovedBy: passSlip.hrApprovedBy?.toString?.() || passSlip.hrApprovedBy,
          departureTime: passSlip.departureTime,
          arrivalTime: passSlip.arrivalTime,
        };
        passSlip.qrCode = await QRCode.toDataURL(JSON.stringify(qrPayload), { errorCorrectionLevel: 'M' });
      } else if (status === 'Rejected') {
        passSlip.status = status;
        if (rejectionReason != null) passSlip.rejectionReason = String(rejectionReason).trim() || undefined;
      } else {
        return res.status(400).json({ message: 'Invalid status update for HR.' });
      }
    } else if (status === 'Rejected') {
      passSlip.status = status;
      if (rejectionReason != null) passSlip.rejectionReason = String(rejectionReason).trim() || undefined;
    }

    await passSlip.save();

    // --- Real-time Update via Socket.IO ---
    const payload = passSlip.toObject ? passSlip.toObject() : passSlip;
    req.io.emit('passSlipStatusUpdate', payload);

    // --- In-App Notification Logic for Employee ---
    try {
      const employee = await User.findById(passSlip.employee);
      if (employee) {
        let notificationMessage = '';
        // Fetch the approver's name to include in the message
        const approver = await User.findById(req.user.userId);
        const approverName = approver ? approver.name : 'A manager';

        if (status === 'Recommended') {
          notificationMessage = `Your pass slip has been recommended by ${approverName} and is now pending HR approval.`;
        } else if (status === 'Approved') {
          notificationMessage = `Your pass slip has been approved by ${approverName}.`;
        } else if (status === 'Rejected') {
          notificationMessage = passSlip.rejectionReason
            ? `Your pass slip has been rejected by ${approverName}: ${passSlip.rejectionReason}`
            : `Your pass slip has been rejected by ${approverName}.`;
        }

        if (notificationMessage) {
          const newNotification = {
            message: notificationMessage,
            type: 'PassSlipStatus',
            relatedId: passSlip._id,
          };
          const savedNotification = employee.notifications.create(newNotification);
          employee.notifications.push(savedNotification);
          await employee.save();
          console.log(`In-app notification created for employee ${employee.name}.`);

          // --- Real-time Notification via Socket.IO ---
          // Normalize to a plain object so Socket.IO sends the expected fields (message/read/createdAt/_id)
          const payload = savedNotification?.toObject ? savedNotification.toObject() : savedNotification;
          req.io.emit('newNotification', { userId: employee._id.toString(), notification: payload });
        }
      }
    } catch (notificationError) {
      console.error('Error creating in-app notification for employee:', notificationError);
    }

    res.json(passSlip);
  } catch (error) {
    console.error('Error updating pass slip status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get slips for the current user
router.get('/my-slips', auth, async (req, res) => {
  try {
    const userSlips = await PassSlip.find({ employee: req.user.userId })
      .populate('employee', 'name profilePicture role')
      .populate('approvedBy', 'name')
      .populate('hrApprovedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json(userSlips);
  } catch (error) {
    console.error('Error fetching user pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a pass slip
router.delete('/:id', auth, async (req, res) => {
  try {
    const passSlip = await PassSlip.findById(req.params.id);

    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    // Optional: Check if the user is authorized to delete
    // For example, only the employee who created it or an admin can delete
    if (passSlip.employee.toString() !== req.user.userId && req.user.role !== 'Admin') {
        // Or if the approver is the one deleting
        if (!passSlip.approvedBy || passSlip.approvedBy.toString() !== req.user.userId) {
             return res.status(403).json({ message: 'User not authorized to delete this slip.' });
        }
    }

    const deletableStatuses = ['Completed', 'Cancelled', 'Rejected'];
    if (!deletableStatuses.includes(passSlip.status)) {
      return res.status(400).json({ message: 'Only completed, cancelled, or rejected pass slips can be deleted.' });
    }

    await passSlip.deleteOne();

    // --- Real-time Update via Socket.IO ---
    req.io.emit('passSlipDeleted', { passSlipId: req.params.id });

    res.json({ message: 'Pass slip deleted successfully.' });
  } catch (error) {
    console.error('Error deleting pass slip:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel a pass slip
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const { cancellationReason } = req.body;
    if (!cancellationReason) {
      return res.status(400).json({ message: 'Cancellation reason is required.' });
    }

    const passSlip = await PassSlip.findById(req.params.id).populate('employee');
    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    if (passSlip.employee._id.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You are not authorized to cancel this pass slip.' });
    }

    if (passSlip.status !== 'Pending') {
      return res.status(400).json({ message: 'Only pending pass slips can be cancelled.' });
    }

    passSlip.status = 'Cancelled';
    passSlip.cancellationReason = cancellationReason;
    await passSlip.save();

    req.io.emit('passSlipStatusUpdate', passSlip);

    // Notify the approver
    try {
      const approver = await User.findById(passSlip.approvedBy);
      if (approver) {
        const newNotif = approver.notifications.create({
          message: `${passSlip.employee.name} has cancelled a pass slip. Reason: ${cancellationReason}`,
          type: 'PassSlipCancelled',
          relatedId: passSlip._id,
        });
        approver.notifications.push(newNotif);
        await approver.save();
        const payload = newNotif?.toObject ? newNotif.toObject() : newNotif;
        req.io.emit('newNotification', { userId: approver._id.toString(), notification: payload });
      }
    } catch (error) {
      console.error('Error sending cancellation notification:', error);
    }

    res.json(passSlip);
  } catch (error) {
    console.error('Error cancelling pass slip:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all recommended pass slips (for HR)
router.get('/recommended', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const recommendedSlips = await PassSlip.find({ status: 'Recommended' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name')
      .select('employee date timeOut estimatedTimeBack destination purpose status approvedBy signature approverSignature latitude longitude routePolyline');
    res.json(recommendedSlips);
  } catch (error) {
    console.error('Error fetching recommended pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all HR approved pass slips (ready for guard submission)
router.get('/hr-approved', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const hrApprovedSlips = await PassSlip.find({ status: 'Approved' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name')
      .populate('hrApprovedBy', 'name')
      .select('employee date timeOut estimatedTimeBack destination purpose status approvedBy hrApprovedBy signature approverSignature hrApproverSignature');
    res.json(hrApprovedSlips);
  } catch (error) {
    console.error('Error fetching HR approved pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all approved pass slips (for Security)
router.get('/completed', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const approvedSlips = await PassSlip.find({ status: 'Approved' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name');
    res.json(approvedSlips);
  } catch (error) {
    console.error('Error fetching approved pass slips for security:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all verified pass slips (for Security)
router.get('/verified', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const verifiedSlips = await PassSlip.find({ status: 'Verified' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name');
    res.json(verifiedSlips);
  } catch (error) {
    console.error('Error fetching verified pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all verified pass slips (for HR - Attendance Monitoring)
router.get('/verified-hr', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const verifiedSlips = await PassSlip.find({ status: { $in: ['Verified', 'Approved'] } })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name')
      .populate('hrApprovedBy', 'name')
      .select('employee date timeOut estimatedTimeBack destination purpose status approvedBy hrApprovedBy signature approverSignature departureTime arrivalTime trackingNo');
    res.json(verifiedSlips);
  } catch (error) {
    console.error('Error fetching verified pass slips for HR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify a pass slip (for Security)
router.put('/:id/verify', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const passSlip = await PassSlip.findById(req.params.id).populate('employee');
    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    if (passSlip.status !== 'Approved' && passSlip.status !== 'Completed') {
      return res.status(400).json({ message: 'Only approved or completed pass slips can be verified.' });
    }

    // Departure date/time restriction: cannot verify until scheduled departure time has been reached
    const departureMoment = parseMeridiemTimeToDate(passSlip.timeOut, passSlip.date);
    if (!departureMoment) {
      return res.status(400).json({ message: 'Invalid departure time on pass slip.' });
    }
    if (new Date() < departureMoment) {
      return res.status(400).json({
        message: 'Cannot verify departure yet. Verification is allowed only at or after the scheduled departure date and time.',
      });
    }

    // Time limit check for Faculty Staff, but not for Security Personnel
    if (passSlip.employee.role === 'Faculty Staff' && passSlip.employee.role !== 'Security Personnel') {
      const today = new Date();
      const dayOfWeek = today.getDay();

      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday to Friday
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const verifiedSlipsToday = await PassSlip.find({
          employee: passSlip.employee._id,
          status: 'Verified',
          departureTime: { $gte: startOfDay, $lte: endOfDay }
        });

        const requestedStart = parseMeridiemTimeToMillisOfDay(passSlip.timeOut);
        const requestedEnd = parseMeridiemTimeToMillisOfDay(passSlip.estimatedTimeBack);
        if (requestedStart === null || requestedEnd === null || requestedEnd <= requestedStart) {
          return res.status(400).json({ message: 'Invalid time format or range on the pass slip.' });
        }
        const requestedDuration = requestedEnd - requestedStart;
        const totalDurationToday = verifiedSlipsToday.reduce((acc, slip) => {
          const start = parseMeridiemTimeToMillisOfDay(slip.timeOut);
          const end = parseMeridiemTimeToMillisOfDay(slip.estimatedTimeBack);
          if (start === null || end === null || end <= start) return acc;
          return acc + (end - start);
        }, 0);

        if (totalDurationToday + requestedDuration > 2 * 60 * 60 * 1000) { // 2 hours in milliseconds
          return res.status(400).json({ message: 'This user has exceeded their 2-hour daily limit for pass slips.' });
        }
      }
    }

    passSlip.status = 'Verified';
    passSlip.departureTime = new Date();
    await passSlip.save();

    // --- Real-time Update via Socket.IO ---
    req.io.emit('passSlipVerified', passSlip);

    res.json(passSlip);
  } catch (error) {
    console.error('Error verifying pass slip:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single pass slip by ID (for Security)
router.get('/:id', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const passSlip = await PassSlip.findById(req.params.id)
      .populate('employee', 'name email profilePicture role')
      .populate('approvedBy', 'name')
      .populate('hrApprovedBy', 'name');

    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    res.json(passSlip);
  } catch (error) {
    console.error('Error fetching pass slip:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark a pass slip as Returned (for Security)
router.put('/:id/return', auth, async (req, res) => {
  try {
    const passSlip = await PassSlip.findById(req.params.id);
    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    if (passSlip.status !== 'Verified') {
      return res.status(400).json({ message: 'Only verified pass slips can be marked as returned.' });
    }

    passSlip.status = 'Returned';
    passSlip.arrivalTime = new Date();
    await passSlip.save();

    // --- Real-time Update via Socket.IO ---
    req.io.emit('passSlipReturned', passSlip);

    res.json(passSlip);
  } catch (error) {
    console.error('Error marking pass slip as returned:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all returned pass slips (for HR)
router.get('/returned', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const returnedSlips = await PassSlip.find({ status: 'Returned' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name');
    res.json(returnedSlips);
  } catch (error) {
    console.error('Error fetching returned pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all verified pass slips (for HR)
router.get('/verified-hr', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const verifiedSlips = await PassSlip.find({ status: 'Verified' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name');
    res.json(verifiedSlips);
  } catch (error) {
    console.error('Error fetching verified pass slips for HR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
