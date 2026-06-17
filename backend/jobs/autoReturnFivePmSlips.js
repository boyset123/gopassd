const PassSlip = require('../models/PassSlip');
const User = require('../models/User');
const { isFivePmEtb, serverNow } = require('../utils/dateTime');
const { getScheduledReturnMoment } = require('../utils/passSlipSchedule');
const { computeReturnBalanceAdjustment, formatReturnAuditDetails } = require('../utils/passSlipBalance');
const { getPassSlipSeconds, getStoredPassSlipSeconds, setPassSlipSeconds } = require('../utils/passSlipBalanceState');
const { appendAuditLog } = require('../utils/auditLog');

function emitBalanceUpdate(io, userId, passSlipSeconds) {
  if (!io) return;
  const seconds = Math.max(0, Math.floor(Number(passSlipSeconds) || 0));
  io.emit('passSlipBalanceUpdated', {
    userId: String(userId),
    passSlipSeconds: seconds,
    passSlipMinutes: Math.floor(seconds / 60),
  });
}

async function autoReturnFivePmSlips(io) {
  try {
    const verified = await PassSlip.find({ status: 'Verified' });
    const now = serverNow();

    for (const slip of verified) {
      if (!isFivePmEtb(slip.estimatedTimeBack)) continue;

      const scheduledReturn = getScheduledReturnMoment(slip);
      if (!scheduledReturn || scheduledReturn.getTime() > now.getTime()) continue;

      const { adjustment, actualMinutes, overdueMinutes } = computeReturnBalanceAdjustment(
        slip,
        scheduledReturn
      );

      slip.status = 'Returned';
      slip.arrivalTime = scheduledReturn;
      slip.overdueMinutes = overdueMinutes;
      slip.actualMinutesUsed = actualMinutes;
      appendAuditLog(slip, {
        action: 'returned',
        label: 'Auto-returned at 5:00 PM',
        role: 'System',
        timestamp: slip.arrivalTime,
        details: formatReturnAuditDetails(actualMinutes, adjustment),
      });
      await slip.save();

      if (adjustment !== 0) {
        const employee = await User.findById(slip.employee);
        if (employee) {
          const updatedSeconds = setPassSlipSeconds(
            employee,
            getStoredPassSlipSeconds(employee) + adjustment,
          );
          await employee.save();
          emitBalanceUpdate(io, employee._id, updatedSeconds);
        }
      }

      if (io) {
        io.emit('passSlipReturned', slip);
      }
    }
  } catch (error) {
    console.error('Error in autoReturnFivePmSlips:', error);
  }
}

module.exports = { autoReturnFivePmSlips };
