const PassSlip = require('../models/PassSlip');
const { isFivePmEtb, serverNow } = require('../utils/dateTime');
const { getScheduledReturnMoment } = require('../utils/passSlipSchedule');

async function autoReturnFivePmSlips(io) {
  try {
    const verified = await PassSlip.find({ status: 'Verified' });
    const now = serverNow();

    for (const slip of verified) {
      if (!isFivePmEtb(slip.estimatedTimeBack)) continue;

      const scheduledReturn = getScheduledReturnMoment(slip);
      if (!scheduledReturn || scheduledReturn.getTime() > now.getTime()) continue;

      slip.status = 'Returned';
      slip.arrivalTime = scheduledReturn;
      slip.overdueMinutes = 0;
      await slip.save();

      if (io) {
        io.emit('passSlipReturned', slip);
      }
    }
  } catch (error) {
    console.error('Error in autoReturnFivePmSlips:', error);
  }
}

module.exports = { autoReturnFivePmSlips };
