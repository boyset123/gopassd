const express = require('express');
const router = express.Router();
const PassSlip = require('../models/PassSlip');
const TravelOrder = require('../models/TravelOrder');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { parseMeridiemTimeToDate } = require('../utils/dateTime');
const { travelOrderToClientJson } = require('../utils/travelOrderSerialize');

router.get('/', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const { campus, faculty, department } = req.query;

    let userQuery = {};
    if (campus) userQuery.campus = campus;
    if (faculty) userQuery.faculty = faculty;
    if (department) userQuery.department = department;

    const passSlips = await PassSlip.find({ status: { $in: ['Returned', 'Completed'] } })
      .populate({
        path: 'employee',
        match: userQuery,
        select: 'name campus faculty department role'
      })
      .populate('approvedBy', 'name');

    const travelOrders = await TravelOrder.find({ status: { $in: ['Completed'] } })
      .populate({
        path: 'employee',
        match: userQuery,
        select: 'name campus faculty department role'
      })
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name')
      // Same as other HR list routes: never send binary over JSON; keep attachment metadata for the web UI.
      .select('-document.data -documents.data');

    const passSlipsWithStatus = passSlips
      .filter(p => p.employee)
      .map(p => {
        const slip = p.toObject();
        if (slip.status === 'Returned' && slip.arrivalTime && slip.estimatedTimeBack) {
          const scheduledReturn = parseMeridiemTimeToDate(slip.estimatedTimeBack, slip.date);
          if (scheduledReturn) {
            const arrivalTime = new Date(slip.arrivalTime);
            const diffMs = arrivalTime.getTime() - scheduledReturn.getTime();
            const formattedArrivalTime = arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

            if (diffMs > 0) {
              const diffMinutes = Math.ceil(diffMs / 60000);
              slip.arrivalStatus = `Overdue by ${diffMinutes} min (${formattedArrivalTime})`;
            } else {
              slip.arrivalStatus = `On Time (${formattedArrivalTime})`;
            }
          }
        } else if (slip.status === 'Completed') {
          slip.arrivalStatus = 'Completed';
        }
        return slip;
      });

    const filteredTravelOrders = travelOrders
      .filter((t) => t.employee)
      .map((t) => travelOrderToClientJson(t));

    res.json([...passSlipsWithStatus, ...filteredTravelOrders]);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
