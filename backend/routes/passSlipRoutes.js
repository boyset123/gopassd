const express = require('express');
const router = express.Router();
const PassSlip = require('../models/PassSlip');
const auth = require('../middleware/auth'); // Assuming you have an auth middleware
const authorize = require('../middleware/authorize');
const QRCode = require('qrcode');
const admin = require('firebase-admin');
const {
  parseMeridiemTimeToDate,
  parseMeridiemTimeToMillisOfDay,
  parseLocalDate,
  serverNow,
  getManilaTodayStart,
  isFivePmEtb,
} = require('../utils/dateTime');
const { getEffectiveSigner, isUserOnTravel, toIdString } = require('../utils/oic');
const { getScheduledReturnMoment, hasScheduledDeparturePassed } = require('../utils/passSlipSchedule');
const { computeReturnBalanceAdjustment, formatReturnAuditDetails } = require('../utils/passSlipBalance');
const { resolvePassSlipMapRoute } = require('../utils/drivingRoute');
const { formatPassSlipBalance } = require('../utils/formatPassSlipBalance');
const { isWithinMatiCity, MATI_CITY_VICINITY_MESSAGE } = require('../utils/matiCityVicinity');
const { getPassSlipSeconds, getStoredPassSlipSeconds, setPassSlipSeconds, serializePassSlipBalance } = require('../utils/passSlipBalanceState');
const { ensurePassSlipTrackingNo, peekPassSlipTrackingNo } = require('../utils/documentNumbers');
const {
  getBillableDurationMs,
  getBillableDurationSeconds,
  getSlipPlannedBillableMinutes,
} = require('../utils/passSlipDuration');
const { findOverlappingPassSlip, formatOverlapMessage } = require('../utils/passSlipOverlap');
const { appendAuditLog, buildPassSlipAuditTrail } = require('../utils/auditLog');
const { getTrackerUsedMinutes } = require('../utils/passSlipTrackerUsage');

function attachEmployeeBalance(slip) {
  const obj = slip?.toObject ? slip.toObject() : { ...slip };
  if (obj.employee && typeof obj.employee === 'object') {
    obj.employee = { ...obj.employee, ...serializePassSlipBalance(obj.employee) };
  }
  return obj;
}

/** Weekly pass-slip cap (mirrors HRP tracker WEEKLY_LIMIT_HOURS = 2). */
const WEEKLY_LIMIT_MINUTES = 120;

function emitBalanceUpdate(io, userId, passSlipSeconds) {
  if (!io) return;
  const seconds = Math.max(0, Math.floor(Number(passSlipSeconds) || 0));
  io.emit('passSlipBalanceUpdated', {
    userId: toIdString(userId),
    passSlipSeconds: seconds,
    passSlipMinutes: Math.floor(seconds / 60),
  });
}

/**
 * Extract Manila-intent date parts (year, monthIndex, day) for a value,
 * independent of the server's local timezone. Returns null on invalid input.
 */
function getManilaDateParts(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, day] = fmt.format(d).split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !day) return null;
  return { year: y, monthIndex: m - 1, day };
}

/**
 * Compute Manila-intent day-of-week (0=Sun..6=Sat) and a stable weekKey
 * (Monday YYYY-MM-DD) for a date value.
 */
function getManilaWeekInfo(value) {
  const parts = getManilaDateParts(value);
  if (!parts) return null;
  const utcDay = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day));
  const dow = utcDay.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(utcDay.getTime());
  monday.setUTCDate(utcDay.getUTCDate() + diff);
  const weekKey = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
  return { dayOfWeek: dow, weekKey };
}

/**
 * Sum (planned + overdue) minutes used by the given employee in the same
 * Monday-Friday week as `targetDate`, across approved-or-later slips.
 * Mirrors the HRP Pass Slip Tracker's bucketing rules.
 */
async function getWeeklyUsedMinutes(employeeId, targetDate) {
  const target = getManilaWeekInfo(targetDate);
  if (!target) return 0;

  // Cast a generous window around the target to keep the Mongo query
  // index-friendly while staying robust to timezone offsets.
  const targetInstant = new Date(targetDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const fromDate = new Date(targetInstant.getTime() - 10 * dayMs);
  const toDate = new Date(targetInstant.getTime() + 10 * dayMs);

  const candidates = await PassSlip.find({
    employee: employeeId,
    status: { $in: ['Approved', 'Verified', 'Returned', 'Completed'] },
    date: { $gte: fromDate, $lte: toDate },
  }).select(
    'date timeOut estimatedTimeBack overdueMinutes status departureTime arrivalTime actualMinutesUsed',
  );

  let used = 0;
  for (const slip of candidates) {
    const info = getManilaWeekInfo(slip.date);
    if (!info || info.weekKey !== target.weekKey) continue;
    if (info.dayOfWeek < 1 || info.dayOfWeek > 5) continue;

    if (slip.status === 'Returned' || slip.status === 'Completed') {
      used += getTrackerUsedMinutes(slip).usedMinutes;
    } else {
      used += getSlipPlannedBillableMinutes(slip);
      if (typeof slip.overdueMinutes === 'number' && slip.overdueMinutes > 0) {
        used += slip.overdueMinutes;
      }
    }
  }
  return used;
}

/**
 * Build a Mongo `$in` list of approver IDs for which the calling user should see
 * pending pass slips: the user themselves plus any on-travel approver whose
 * effective signer currently resolves to them (via OIC primary or fallback).
 */
async function approverIdsVisibleToUser(userId) {
  const ids = new Set([toIdString(userId)]);
  const User = require('../models/User');
  const delegators = await User.find({
    oicPrimary: userId,
  }).select('_id').lean();

  for (const d of delegators) {
    const resolution = await getEffectiveSigner(d._id);
    if (resolution && toIdString(resolution.signerId) === toIdString(userId) && resolution.viaOic) {
      ids.add(toIdString(d._id));
    }
  }
  return Array.from(ids).filter(Boolean);
}

// Create a new pass slip
const User = require('../models/User');

router.post('/', auth, async (req, res) => {
  try {
    const {
      date,
      timeOut,
      estimatedTimeBack,
      destination,
      purpose,
      signature,
      latitude,
      longitude,
      originLatitude,
      originLongitude,
      routePolyline,
    } = req.body;

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

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        message: 'Please select a destination within Mati City using the map or address suggestions.',
      });
    }

    if (!isWithinMatiCity(latitude, longitude)) {
      return res.status(400).json({ message: MATI_CITY_VICINITY_MESSAGE });
    }

    const startTime = parseMeridiemTimeToDate(timeOut, date);
    const endTime = parseMeridiemTimeToDate(estimatedTimeBack, date);

    if (!startTime || !endTime || endTime < startTime) {
        return res.status(400).json({ message: 'Invalid time format or range.' });
    }

    const manilaToday = getManilaTodayStart();
    if (manilaToday) {
      const slipDay = parseMeridiemTimeToDate('12:00 AM', date);
      if (slipDay && slipDay.getTime() < manilaToday.getTime()) {
        return res.status(400).json({ message: 'Cannot create a pass slip for a date that has already passed.' });
      }
    }

    const now = serverNow();
    const manilaTodayForCreate = getManilaTodayStart();
    const slipDayForCreate = parseMeridiemTimeToDate('12:00 AM', date);
    const isSlipToday =
      manilaTodayForCreate &&
      slipDayForCreate &&
      slipDayForCreate.getTime() === manilaTodayForCreate.getTime();
    if (isSlipToday && startTime.getTime() < now.getTime()) {
      return res.status(400).json({
        message: 'Cannot create a pass slip for a scheduled departure time that has already passed.',
      });
    }

    const overlapConflict = await findOverlappingPassSlip(
      req.user.userId,
      date,
      timeOut,
      estimatedTimeBack,
    );
    if (overlapConflict) {
      return res.status(400).json({ message: formatOverlapMessage(overlapConflict) });
    }

    const durationSeconds = getBillableDurationSeconds(startTime, endTime, date);
    const durationMinutes = durationSeconds / 60;

    if (getPassSlipSeconds(user) < durationSeconds) {
      return res.status(400).json({
        message: `Insufficient pass slip balance. You have ${formatPassSlipBalance(getPassSlipSeconds(user))} remaining, but this request needs ${formatPassSlipBalance(durationSeconds)}.`,
      });
    }

    // Weekly 2-hour cap (matches the HRP Pass Slip Tracker view). Only Mon-Fri
    // slips count, and only Approved-or-later existing slips are summed —
    // mirroring how the tracker buckets approved usage.
    const slipWeek = getManilaWeekInfo(date);
    if (slipWeek && slipWeek.dayOfWeek >= 1 && slipWeek.dayOfWeek <= 5) {
      const weekUsedMinutes = await getWeeklyUsedMinutes(req.user.userId, date);
      if (weekUsedMinutes + durationMinutes > WEEKLY_LIMIT_MINUTES) {
        const remaining = Math.max(0, WEEKLY_LIMIT_MINUTES - weekUsedMinutes);
        return res.status(400).json({
          message: `This pass slip exceeds the 2-hour weekly cap. You have ${formatPassSlipBalance(Math.round(remaining * 60))} left this week, but this request needs ${formatPassSlipBalance(durationSeconds)}.`,
        });
      }
    }

    const newPassSlip = new PassSlip({
      date,
      employee: req.user.userId,
      timeOut,
      estimatedTimeBack,
      destination,
      requiredVicinity: 'Mati City',
      purpose,
      approvedBy: approverId,
      signature,
      latitude,
      longitude,
      originLatitude,
      originLongitude,
      routePolyline,
    });

    appendAuditLog(newPassSlip, {
      action: 'submitted',
      label: 'Pass slip submitted',
      performedBy: req.user.userId,
      performedByName: user.name,
      role: user.role,
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

// Annotates a pending slip with effective-signer info so clients can show OIC badges.
async function annotateWithNextSigner(slips) {
  return Promise.all(
    slips.map(async (s) => {
      const obj = s.toObject ? s.toObject() : s;
      if (obj.approvedBy?._id) {
        const resolution = await getEffectiveSigner(obj.approvedBy._id);
        if (resolution) {
          obj.nextSigner = {
            originalId: resolution.originalId,
            originalName: resolution.original?.name || null,
            signerId: resolution.signerId,
            signerName: resolution.signer?.name || null,
            viaOic: resolution.viaOic,
            noDelegateAvailable: !!resolution.noDelegateAvailable,
          };
        }
      }
      return obj;
    })
  );
}

// Get all pending pass slips (for Program Head and any user acting as their OIC)
router.get('/pending', [auth], async (req, res) => {
  try {
    const approverIds = await approverIdsVisibleToUser(req.user.userId);
    const pendingSlips = await PassSlip.find({ approvedBy: { $in: approverIds }, status: 'Pending' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name role');
    res.json(await annotateWithNextSigner(pendingSlips));
  } catch (error) {
    console.error('Error fetching pending pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all pending pass slips (for Faculty Dean and any user acting as their OIC)
router.get('/dean-pending', [auth], async (req, res) => {
  try {
    const approverIds = await approverIdsVisibleToUser(req.user.userId);
    const pendingSlips = await PassSlip.find({ approvedBy: { $in: approverIds }, status: 'Pending' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name role');
    res.json(await annotateWithNextSigner(pendingSlips));
  } catch (error) {
    console.error('Error fetching pending pass slips for dean:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all pending pass slips (for President and any user acting as their OIC)
router.get('/president-pending', [auth], async (req, res) => {
  try {
    const approverIds = await approverIdsVisibleToUser(req.user.userId);
    const pendingSlips = await PassSlip.find({ approvedBy: { $in: approverIds }, status: 'Pending' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name role');
    res.json(await annotateWithNextSigner(pendingSlips));
  } catch (error) {
    console.error('Error fetching pending pass slips for president:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update pass slip status (for first-line approvers, their OICs, and HR)
router.put('/:id/status', [auth], async (req, res) => {
  try {
    const { status, approverSignature, rejectionReason, closureReason } = req.body;

    const passSlip = await PassSlip.findById(req.params.id);
    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    const isHr = req.user.role === 'Human Resource Personnel';
    const actor = await User.findById(req.user.userId).select('name role').lean();

    if (isHr) {
      if (!['Approved', 'Completed', 'Rejected', 'Expired'].includes(status)) {
        return res.status(400).json({ message: 'HR can only approve, complete, reject, or close (expire) pass slips.' });
      }
    } else {
      if (!['Recommended', 'Rejected'].includes(status)) {
        return res.status(400).json({ message: 'Approvers can only recommend or reject pass slips.' });
      }
    }

    // Validate status transitions
    if (!isHr && status === 'Recommended') {
      if (passSlip.status !== 'Pending') {
        return res.status(400).json({ message: 'Approvers can only recommend pending pass slips.' });
      }
      // The slip's `approvedBy` at create time is the originally intended approver.
      const originalApproverId = passSlip.approvedBy;
      if (!originalApproverId) {
        return res.status(400).json({ message: 'This pass slip has no assigned approver.' });
      }

      // Resolve the effective signer (handles OIC delegation when approver is on travel).
      const resolution = await getEffectiveSigner(originalApproverId);
      if (!resolution) {
        return res.status(404).json({ message: 'Approver not found.' });
      }
      const expectedSignerId = toIdString(resolution.signerId);
      if (toIdString(req.user.userId) !== expectedSignerId) {
        return res.status(403).json({
          message: resolution.viaOic
            ? 'Only the assigned OIC can sign while this approver is on travel.'
            : 'You are not the approver for this pass slip.',
        });
      }

      passSlip.status = 'Recommended';
      passSlip.approvedBy = req.user.userId;
      passSlip.approverSignature = approverSignature;
      passSlip.approvedBySignedAsOicFor = resolution.viaOic ? resolution.originalId : null;
      passSlip.recommendedAt = new Date();
      appendAuditLog(passSlip, {
        action: 'recommended',
        label: resolution.viaOic
          ? `Recommended (OIC for ${resolution.original?.name || 'approver'})`
          : `Recommended by ${actor?.role || 'approver'}`,
        performedBy: req.user.userId,
        performedByName: actor?.name,
        role: actor?.role,
        timestamp: passSlip.recommendedAt,
      });
    } else if (!isHr && status === 'Rejected') {
      // Only the assigned approver or their currently-acting OIC can reject.
      if (!passSlip.approvedBy) {
        return res.status(400).json({ message: 'This pass slip has no assigned approver.' });
      }
      const resolution = await getEffectiveSigner(passSlip.approvedBy);
      if (!resolution || toIdString(resolution.signerId) !== toIdString(req.user.userId)) {
        return res.status(403).json({ message: 'You are not authorized to reject this pass slip.' });
      }
      passSlip.status = status;
      if (rejectionReason != null) passSlip.rejectionReason = String(rejectionReason).trim() || undefined;
      passSlip.rejectedAt = new Date();
      appendAuditLog(passSlip, {
        action: 'rejected',
        label: 'Pass slip rejected',
        performedBy: req.user.userId,
        performedByName: actor?.name,
        role: actor?.role,
        timestamp: passSlip.rejectedAt,
        details: passSlip.rejectionReason,
      });
    } else if (isHr) {
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

        const now = serverNow();
        const manilaTodayForApproval = getManilaTodayStart();
        const slipDayForApproval = parseMeridiemTimeToDate('12:00 AM', passSlip.date);
        const isApprovalToday =
          manilaTodayForApproval &&
          slipDayForApproval &&
          slipDayForApproval.getTime() === manilaTodayForApproval.getTime();
        if (isApprovalToday && startTime.getTime() < now.getTime()) {
          return res.status(400).json({
            message: 'Cannot approve a pass slip whose scheduled departure time has already passed.',
          });
        }

        const approvalOverlap = await findOverlappingPassSlip(
          passSlip.employee,
          passSlip.date,
          passSlip.timeOut,
          passSlip.estimatedTimeBack,
          { excludePassSlipId: passSlip._id },
        );
        if (approvalOverlap) {
          return res.status(400).json({ message: formatOverlapMessage(approvalOverlap) });
        }

        const durationSeconds = getBillableDurationSeconds(startTime, endTime, passSlip.date);
        const durationMinutes = durationSeconds / 60;

        if (getPassSlipSeconds(user) < durationSeconds) {
          return res.status(400).json({
            message: `Insufficient pass slip balance. The user has ${formatPassSlipBalance(getPassSlipSeconds(user))} remaining, but this request needs ${formatPassSlipBalance(durationSeconds)}.`,
          });
        }

        // Enforce the same 2-hour weekly cap at approval time so a backlog of
        // pending slips cannot collectively exceed the limit shown in the tracker.
        const approvalWeek = getManilaWeekInfo(passSlip.date);
        if (approvalWeek && approvalWeek.dayOfWeek >= 1 && approvalWeek.dayOfWeek <= 5) {
          const weekUsedMinutes = await getWeeklyUsedMinutes(passSlip.employee, passSlip.date);
          if (weekUsedMinutes + durationMinutes > WEEKLY_LIMIT_MINUTES) {
            const remaining = Math.max(0, WEEKLY_LIMIT_MINUTES - weekUsedMinutes);
            return res.status(400).json({
              message: `Approving this pass slip would exceed the user's 2-hour weekly cap. They have ${formatPassSlipBalance(Math.round(remaining * 60))} left this week, but this slip needs ${formatPassSlipBalance(durationSeconds)}.`,
            });
          }
        }

        const updatedSeconds = setPassSlipSeconds(
          user,
          getPassSlipSeconds(user) - durationSeconds,
        );
        await user.save();
        emitBalanceUpdate(req.io, user._id, updatedSeconds);

        passSlip.status = 'Approved';
        passSlip.hrApprovedBy = req.user.userId;
        passSlip.hrApproverSignature = approverSignature;
        passSlip.hrApprovedAt = new Date();
        await ensurePassSlipTrackingNo(passSlip);
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
        appendAuditLog(passSlip, {
          action: 'hr_approved',
          label: 'Approved by Human Resource',
          performedBy: req.user.userId,
          performedByName: actor?.name,
          role: actor?.role || 'Human Resource Personnel',
          timestamp: passSlip.hrApprovedAt,
          details: passSlip.trackingNo ? `Tracking No: ${passSlip.trackingNo}` : undefined,
        });
      } else if (status === 'Rejected') {
        passSlip.status = status;
        if (rejectionReason != null) passSlip.rejectionReason = String(rejectionReason).trim() || undefined;
        passSlip.rejectedAt = new Date();
        appendAuditLog(passSlip, {
          action: 'rejected',
          label: 'Pass slip rejected by Human Resource',
          performedBy: req.user.userId,
          performedByName: actor?.name,
          role: actor?.role || 'Human Resource Personnel',
          timestamp: passSlip.rejectedAt,
          details: passSlip.rejectionReason,
        });
      } else if (status === 'Expired') {
        if (passSlip.status !== 'Recommended') {
          return res.status(400).json({ message: 'HR can only close pass slips that are pending HR recording (Recommended).' });
        }
        if (!hasScheduledDeparturePassed(passSlip)) {
          return res.status(400).json({ message: 'Cannot close a pass slip before its scheduled departure time.' });
        }
        passSlip.status = 'Expired';
        if (closureReason != null) passSlip.closureReason = String(closureReason).trim() || undefined;
        passSlip.expiredAt = new Date();
        appendAuditLog(passSlip, {
          action: 'expired',
          label: 'Pass slip expired',
          performedBy: req.user.userId,
          performedByName: actor?.name,
          role: actor?.role || 'Human Resource Personnel',
          timestamp: passSlip.expiredAt,
          details: passSlip.closureReason,
        });
      } else {
        return res.status(400).json({ message: 'Invalid status update for HR.' });
      }
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
        } else if (status === 'Expired') {
          const base =
            'Your pass slip was not recorded before your scheduled departure and has been closed. No pass slip minutes were deducted.';
          notificationMessage = passSlip.closureReason ? `${base} Note: ${passSlip.closureReason}` : base;
        }

        if (notificationMessage) {
          const newNotification = {
            message: notificationMessage,
            type: status === 'Expired' ? 'PassSlipExpired' : 'PassSlipStatus',
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

// HR calendar: pass slips in a Manila date range (must be before /:id routes)
router.get('/calendar', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const { from, to, campus, faculty, status } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: 'from and to query parameters are required (YYYY-MM-DD).' });
    }

    const fromStart = parseLocalDate(from);
    const toDayStart = parseLocalDate(to);
    if (!fromStart || !toDayStart) {
      return res.status(400).json({ message: 'Invalid from or to date format. Use YYYY-MM-DD.' });
    }
    const toEndExclusive = new Date(toDayStart.getTime() + 24 * 60 * 60 * 1000);

    const query = {
      date: { $gte: fromStart, $lt: toEndExclusive },
    };
    if (status && String(status).trim() && status !== 'All') {
      query.status = String(status).trim();
    }

    let slips = await PassSlip.find(query)
      .populate('employee', 'name campus faculty role')
      .select('_id date timeOut estimatedTimeBack destination purpose status employee trackingNo')
      .sort({ date: 1, timeOut: 1 })
      .lean();

    if (campus && campus !== 'All Campuses') {
      slips = slips.filter((slip) => slip.employee?.campus === campus);
    }
    if (faculty && faculty !== 'All Faculties') {
      slips = slips.filter((slip) => slip.employee?.faculty === faculty);
    }

    res.json(slips);
  } catch (error) {
    console.error('Error fetching calendar pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all returned pass slips (for HR) — must be before /:id routes
router.get('/returned', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const returnedSlips = await PassSlip.find({ status: 'Returned' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role');
    res.json(returnedSlips);
  } catch (error) {
    console.error('Error fetching returned pass slips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get slips for the current user
router.get('/my-slips', auth, async (req, res) => {
  try {
    const userSlips = await PassSlip.find({ employee: req.user.userId })
      .populate('employee', 'name profilePicture role')
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role')
      .populate('hrApprovedBy', 'name')
      .populate('cancelledBy', 'name')
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

    const deletableStatuses = ['Completed', 'Cancelled', 'Rejected', 'Expired'];
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
    passSlip.cancelledBy = req.user.userId;
    passSlip.cancelledAt = new Date();
    appendAuditLog(passSlip, {
      action: 'cancelled',
      label: 'Pass slip cancelled',
      performedBy: req.user.userId,
      performedByName: passSlip.employee?.name,
      role: passSlip.employee?.role,
      timestamp: passSlip.cancelledAt,
      details: cancellationReason,
    });
    await passSlip.save();

    await passSlip.populate('cancelledBy', 'name');

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

// Preview next tracking number for HR (does not increment counter)
router.get('/:id/preview-tracking-no', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const passSlip = await PassSlip.findById(req.params.id).select('date trackingNo');
    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }
    if (passSlip.trackingNo && String(passSlip.trackingNo).trim()) {
      return res.json({ preview: String(passSlip.trackingNo).trim() });
    }
    const preview = await peekPassSlipTrackingNo(passSlip.date);
    res.json({ preview });
  } catch (error) {
    console.error('Error previewing pass slip tracking number:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all recommended pass slips (for HR)
router.get('/recommended', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const recommendedSlips = await PassSlip.find({ status: 'Recommended' })
      .populate('employee', 'name email profilePicture')
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role')
      .select('employee date timeOut estimatedTimeBack destination purpose status approvedBy approvedBySignedAsOicFor signature approverSignature latitude longitude originLatitude originLongitude routePolyline overdueMinutes trackingNo')
      .lean();

    for (const slip of recommendedSlips) {
      if (!slip.trackingNo || !String(slip.trackingNo).trim()) {
        try {
          slip.trackingNoPreview = await peekPassSlipTrackingNo(slip.date);
        } catch (previewErr) {
          console.warn('Failed to preview tracking number for slip:', slip._id, previewErr?.message || previewErr);
        }
      }
    }

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
      .populate('employee', 'name email profilePicture passSlipSeconds passSlipMinutes role')
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role')
      .populate('hrApprovedBy', 'name')
      .select('employee date timeOut estimatedTimeBack destination purpose status approvedBy approvedBySignedAsOicFor hrApprovedBy signature approverSignature hrApproverSignature departureTime arrivalTime actualMinutesUsed latitude longitude originLatitude originLongitude routePolyline overdueMinutes');
    res.json(hrApprovedSlips.map(attachEmployeeBalance));
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
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role');
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
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role');
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
      .populate('employee', 'name email profilePicture passSlipSeconds passSlipMinutes role')
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role')
      .populate('hrApprovedBy', 'name')
      .select('employee date timeOut estimatedTimeBack destination purpose status approvedBy approvedBySignedAsOicFor hrApprovedBy signature approverSignature departureTime arrivalTime actualMinutesUsed trackingNo latitude longitude originLatitude originLongitude routePolyline overdueMinutes');
    res.json(verifiedSlips.map(attachEmployeeBalance));
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

        const requestedStart = parseMeridiemTimeToDate(passSlip.timeOut, passSlip.date);
        const requestedEnd = parseMeridiemTimeToDate(passSlip.estimatedTimeBack, passSlip.date);
        if (!requestedStart || !requestedEnd || requestedEnd <= requestedStart) {
          return res.status(400).json({ message: 'Invalid time format or range on the pass slip.' });
        }
        const requestedDuration = getBillableDurationMs(requestedStart, requestedEnd, passSlip.date);
        const totalDurationToday = verifiedSlipsToday.reduce((acc, slip) => {
          const start = parseMeridiemTimeToDate(slip.timeOut, slip.date);
          const end = parseMeridiemTimeToDate(slip.estimatedTimeBack, slip.date);
          if (!start || !end || end <= start) return acc;
          return acc + getBillableDurationMs(start, end, slip.date);
        }, 0);

        if (totalDurationToday + requestedDuration > 2 * 60 * 60 * 1000) { // 2 hours in milliseconds
          return res.status(400).json({ message: 'This user has exceeded their 2-hour daily limit for pass slips.' });
        }
      }
    }

    passSlip.status = 'Verified';
    passSlip.departureTime = new Date();
    appendAuditLog(passSlip, {
      action: 'verified',
      label: 'Departure verified by Security',
      performedBy: req.user.userId,
      performedByName: (await User.findById(req.user.userId).select('name').lean())?.name,
      role: 'Security Personnel',
      timestamp: passSlip.departureTime,
    });
    await passSlip.save();

    // --- Real-time Update via Socket.IO ---
    req.io.emit('passSlipVerified', passSlip);

    res.json(passSlip);
  } catch (error) {
    console.error('Error verifying pass slip:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Location / route fields for HR map view (must be registered before /:id).
router.get('/:id/audit-trail', auth, async (req, res) => {
  try {
    const passSlip = await PassSlip.findById(req.params.id)
      .populate('employee', 'name role')
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role')
      .populate('hrApprovedBy', 'name role')
      .populate('cancelledBy', 'name role');

    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    const ownerId = toIdString(passSlip.employee?._id || passSlip.employee);
    const isOwner = ownerId === toIdString(req.user.userId);
    const isStaff = ['Human Resource Personnel', 'Security Personnel', 'Admin'].includes(req.user.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ message: 'Not authorized to view this audit trail.' });
    }

    res.json(buildPassSlipAuditTrail(passSlip));
  } catch (error) {
    console.error('Error fetching pass slip audit trail:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id/location', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const slip = await PassSlip.findById(req.params.id)
      .select('destination latitude longitude originLatitude originLongitude routePolyline')
      .lean();
    if (!slip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }
    if (slip.latitude == null || slip.longitude == null) {
      return res.status(400).json({ message: 'Location data is not available for this pass slip.' });
    }

    const route = await resolvePassSlipMapRoute(slip);
    if (!route) {
      return res.status(400).json({ message: 'Location data is not available for this pass slip.' });
    }

    res.json({
      destination: slip.destination,
      latitude: slip.latitude,
      longitude: slip.longitude,
      originLatitude: route.originLatitude,
      originLongitude: route.originLongitude,
      originLabel: route.originLabel,
      routePolyline: slip.routePolyline || undefined,
      routeCoordinates: route.routeCoordinates,
    });
  } catch (error) {
    console.error('Error fetching pass slip location:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single pass slip by ID (for Security)
router.get('/:id', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const passSlip = await PassSlip.findById(req.params.id)
      .populate('employee', 'name email profilePicture role')
      .populate('approvedBy', 'name role')
      .populate('approvedBySignedAsOicFor', 'name role')
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
router.put('/:id/return', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const passSlip = await PassSlip.findById(req.params.id);
    if (!passSlip) {
      return res.status(404).json({ message: 'Pass slip not found.' });
    }

    if (passSlip.status !== 'Verified') {
      return res.status(400).json({ message: 'Only verified pass slips can be marked as returned.' });
    }

    if (isFivePmEtb(passSlip.estimatedTimeBack)) {
      return res.status(400).json({ message: 'This pass slip auto-returns at 5:00 PM.' });
    }

    const arrival = serverNow();
    const { adjustment, actualMinutes, overdueMinutes } = computeReturnBalanceAdjustment(passSlip, arrival);

    passSlip.status = 'Returned';
    passSlip.arrivalTime = arrival;
    passSlip.overdueMinutes = overdueMinutes;
    passSlip.actualMinutesUsed = actualMinutes;
    appendAuditLog(passSlip, {
      action: 'returned',
      label: 'Return recorded by Security',
      performedBy: req.user.userId,
      performedByName: (await User.findById(req.user.userId).select('name').lean())?.name,
      role: 'Security Personnel',
      timestamp: passSlip.arrivalTime,
      details: formatReturnAuditDetails(actualMinutes, adjustment),
    });

    await passSlip.save();

    if (adjustment !== 0) {
      const employee = await User.findById(passSlip.employee);
      if (employee) {
        const updatedSeconds = setPassSlipSeconds(
          employee,
          getStoredPassSlipSeconds(employee) + adjustment,
        );
        await employee.save();
        emitBalanceUpdate(req.io, employee._id, updatedSeconds);
      }
    }

    // --- Real-time Update via Socket.IO ---
    req.io.emit('passSlipReturned', passSlip);

    res.json({
      ...passSlip.toObject(),
      balanceAdjustmentSeconds: adjustment,
    });
  } catch (error) {
    console.error('Error marking pass slip as returned:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
