const PassSlip = require('../models/PassSlip');
const User = require('../models/User');
const { hasScheduledDeparturePassed } = require('../utils/passSlipSchedule');
const { appendAuditLog } = require('../utils/auditLog');

const AUTO_CLOSE_REASON = 'Automatically closed — not recorded before scheduled departure.';

async function notifyEmployeeExpired(io, passSlip) {
  try {
    const employee = await User.findById(passSlip.employee);
    if (!employee) return;

    const base =
      'Your pass slip was not recorded before your scheduled departure and has been closed. No pass slip minutes were deducted.';
    const message = passSlip.closureReason ? `${base} Note: ${passSlip.closureReason}` : base;

    const newNotification = employee.notifications.create({
      message,
      type: 'PassSlipExpired',
      relatedId: passSlip._id,
    });
    employee.notifications.push(newNotification);
    await employee.save();

    if (io) {
      const payload = newNotification?.toObject ? newNotification.toObject() : newNotification;
      io.emit('newNotification', { userId: employee._id.toString(), notification: payload });
    }
  } catch (error) {
    console.error('Error notifying employee of expired pass slip:', error);
  }
}

async function autoExpireRecommendedSlips(io) {
  try {
    const recommended = await PassSlip.find({ status: 'Recommended' });

    for (const slip of recommended) {
      if (!hasScheduledDeparturePassed(slip)) continue;

      slip.status = 'Expired';
      slip.closureReason = AUTO_CLOSE_REASON;
      slip.expiredAt = new Date();
      appendAuditLog(slip, {
        action: 'expired',
        label: 'Pass slip expired',
        performedByName: 'System',
        role: 'System',
        timestamp: slip.expiredAt,
        details: AUTO_CLOSE_REASON,
      });
      await slip.save();

      if (io) {
        const payload = slip.toObject ? slip.toObject() : slip;
        io.emit('passSlipStatusUpdate', payload);
      }

      await notifyEmployeeExpired(io, slip);
    }
  } catch (error) {
    console.error('Error in autoExpireRecommendedSlips:', error);
  }
}

module.exports = { autoExpireRecommendedSlips };
