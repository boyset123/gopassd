const PassSlip = require('../models/PassSlip');
const User = require('../models/User');
const { isFivePmEtb, serverNow } = require('../utils/dateTime');
const { getScheduledReturnMoment } = require('../utils/passSlipSchedule');
const { computeReturnBalanceAdjustment } = require('../utils/passSlipBalance');

function emitBalanceUpdate(io, userId, passSlipMinutes) {
  if (!io) return;
  io.emit('passSlipBalanceUpdated', {
    userId: String(userId),
    passSlipMinutes: Math.max(0, Math.floor(Number(passSlipMinutes) || 0)),
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
      await slip.save();

      if (adjustment !== 0) {
        const employee = await User.findById(slip.employee);
        if (employee) {
          const currentBalance = Math.max(0, Math.floor(Number(employee.passSlipMinutes) || 0));
          employee.passSlipMinutes = Math.max(0, currentBalance + adjustment);
          await employee.save();
          emitBalanceUpdate(io, employee._id, employee.passSlipMinutes);
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
