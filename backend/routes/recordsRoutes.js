const express = require('express');
const router = express.Router();
const PassSlip = require('../models/PassSlip');
const TravelOrder = require('../models/TravelOrder');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

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
      .populate('presidentApprovedBy', 'name');

    const parseTime = (timeStr, date) => {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;

      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();

      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      const newDate = new Date(date);
      newDate.setHours(hours, minutes, 0, 0);
      return newDate;
    };

    const passSlipsWithStatus = passSlips
      .filter(p => p.employee)
      .map(p => {
        const slip = p.toObject();
        if (slip.status === 'Returned' && slip.arrivalTime && slip.estimatedTimeBack) {
          const estimatedTime = parseTime(slip.estimatedTimeBack, slip.arrivalTime);
          if (estimatedTime) {
            const arrivalTime = new Date(slip.arrivalTime);
            const diffMinutes = Math.round((arrivalTime - estimatedTime) / 60000);
            const formattedArrivalTime = arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

            if (diffMinutes > 0) {
              slip.arrivalStatus = `Overdue by ${diffMinutes} min (${formattedArrivalTime})`
            } else {
              slip.arrivalStatus = `On Time (${formattedArrivalTime})`
            }
          }
        } else if (slip.status === 'Completed') {
            slip.arrivalStatus = 'Completed';
        }
        return slip;
      });

    const filteredTravelOrders = travelOrders.filter(t => t.employee);

    res.json([...passSlipsWithStatus, ...filteredTravelOrders]);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
