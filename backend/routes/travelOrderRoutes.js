const express = require('express');
const router = express.Router();
const TravelOrder = require('../models/TravelOrder');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const User = require('../models/User');
const TravelOrderCounter = require('../models/TravelOrderCounter');
const QRCode = require('qrcode');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Build QR payload with full document details for guard (no base64 signatures)
function buildTravelOrderQrPayload(doc) {
  const recs = Array.isArray(doc.recommendedBy) ? doc.recommendedBy : [];
  return {
    id: doc._id.toString(),
    type: 'TravelOrder',
    status: doc.status,
    date: doc.date,
    travelOrderNo: doc.travelOrderNo,
    address: doc.address,
    salary: doc.salary,
    to: doc.to,
    purpose: doc.purpose,
    departureDate: doc.departureDate,
    timeOut: doc.timeOut,
    arrivalDate: doc.arrivalDate,
    additionalInfo: doc.additionalInfo,
    employeeAddress: doc.employeeAddress,
    employee: doc.employee ? { name: doc.employee.name, role: doc.employee.role } : undefined,
    recommendedBy: recs.map((r, i) => ({ name: r?.name || '', _id: `qr-${i}` })),
    recommendersWhoApproved: recs.map((_, i) => `qr-${i}`),
    approvedBy: doc.approvedBy ? { name: doc.approvedBy.name } : undefined,
    presidentApprovedBy: doc.presidentApprovedBy ? { name: doc.presidentApprovedBy.name } : undefined,
    departureTime: doc.departureTime,
    arrivalTime: doc.arrivalTime,
  };
}

async function ensureServerTravelOrderNo(travelOrder) {
  if (travelOrder.travelOrderNo && String(travelOrder.travelOrderNo).trim()) return travelOrder.travelOrderNo;

  const baseDate = travelOrder.date ? new Date(travelOrder.date) : new Date();
  if (isNaN(baseDate.getTime())) throw new Error('Invalid travel order date for number generation.');

  const yyyy = baseDate.getFullYear();
  const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
  const yy = String(yyyy).slice(-2);
  const key = `${yyyy}-${mm}`;

  // Atomic per-month increment (safe under concurrency)
  const counter = await TravelOrderCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq4 = String(counter.seq).padStart(4, '0');
  const generated = `${mm} - ${seq4} - ${yy}`;
  travelOrder.travelOrderNo = generated;
  return generated;
}

/** In-app + socket notification for every user with a given role (e.g. President, Human Resource Personnel). */
async function notifyUsersWithRole(io, role, { message, type, relatedId }) {
  try {
    const users = await User.find({ role });
    for (const u of users) {
      const newNotif = u.notifications.create({ message, type, relatedId });
      u.notifications.push(newNotif);
      await u.save();
      const last = u.notifications[u.notifications.length - 1];
      const payload = last.toObject ? last.toObject() : last;
      io.emit('newNotification', { userId: u._id.toString(), notification: payload });
    }
  } catch (err) {
    console.error(`notifyUsersWithRole(${role}) failed:`, err);
  }
}

// Create a new travel order
router.post('/', [auth, upload.single('document')], async (req, res) => {
  try {
    const { date, address, salary, to, purpose, departureDate, arrivalDate, additionalInfo, timeOut, recommendedBy, participants, employeeAddress } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.role === 'Security Personnel') {
      return res.status(403).json({ message: 'Security personnel are not allowed to create travel orders.' });
    }

    // Parse dates and normalize to whole minute so stored value matches app display (no seconds/ms)
    const toMinute = (d) => {
      if (d == null) return undefined;
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return undefined;
      dt.setSeconds(0, 0);
      return dt;
    };
    const parsedDate = toMinute(date);
    const parsedDeparture = toMinute(departureDate);
    const parsedArrival = toMinute(arrivalDate);

    const travelOrderData = {
      employee: req.user.userId,
      date: parsedDate,
      address,
      salary,
      to,
      purpose,
      departureDate: parsedDeparture,
      arrivalDate: parsedArrival,
      additionalInfo,
      timeOut,
      status: 'Pending',
      participants: participants ? JSON.parse(participants) : [],
      employeeAddress,
    };

    if (req.file) {
      travelOrderData.document = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        name: req.file.originalname
      };
    }

    if (recommendedBy) {
      const recommenderIds = JSON.parse(recommendedBy);
      if (Array.isArray(recommenderIds) && recommenderIds.length > 0) {
        travelOrderData.recommendedBy = recommenderIds;
      } else {
        return res.status(400).json({ message: 'Invalid recommender format.' });
      }
    }

    const newTravelOrder = new TravelOrder(travelOrderData);

    const travelOrder = await newTravelOrder.save();

    // --- Create Notifications for Recommenders (broadcast so mobile receives without socket rooms) ---
    if (travelOrderData.recommendedBy && travelOrderData.recommendedBy.length > 0) {
      for (const recommenderId of travelOrderData.recommendedBy) {
        const recommender = await User.findById(recommenderId);
        if (recommender) {
          const newNotif = recommender.notifications.create({
            message: `A new travel order from ${user.name} requires your recommendation.`,
            type: 'New Travel Order',
            relatedId: travelOrder._id,
          });
          recommender.notifications.push(newNotif);
          await recommender.save();
          const payload = recommender.notifications[recommender.notifications.length - 1].toObject ? recommender.notifications[recommender.notifications.length - 1].toObject() : recommender.notifications[recommender.notifications.length - 1];
          req.io.emit('newNotification', { userId: recommenderId.toString(), notification: payload });
        }
      }
    }

    // --- Real-time Update via Socket.IO ---
    req.io.emit('travelOrderDataChanged', travelOrder);

    res.status(201).json(travelOrder);
  } catch (error) {
    console.error('Error creating travel order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get all travel orders for president approval
router.get('/for-president-approval', [auth, authorize('President')], async (req, res) => {
  try {
    const forPresidentApprovalOrders = await TravelOrder.find({ status: 'For President Approval' })
      .populate('employee', 'name email profilePicture role')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .select('employee travelOrderNo date address salary to purpose departureDate arrivalDate additionalInfo status signature approverSignature employeeAddress recommenderSignatures recommendersWhoApproved');
    res.json(forPresidentApprovalOrders);
  } catch (error) { 
    console.error('Error fetching travel orders for president approval:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve a travel order (for President)
router.put('/:id/approve-president', [auth, authorize('President')], async (req, res) => {
  try {
    const { approverSignature } = req.body;

    const travelOrder = await TravelOrder.findById(req.params.id).populate('employee', 'name');
    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    if (travelOrder.status !== 'For President Approval') {
      return res.status(400).json({ message: 'Only travel orders submitted for president approval can be approved.' });
    }

    travelOrder.status = 'President Approved';
    travelOrder.presidentApprovedBy = req.user.userId;
    travelOrder.presidentSignature = approverSignature;

    await travelOrder.populate([{ path: 'employee', select: 'name role' }, { path: 'recommendedBy', select: 'name' }, { path: 'presidentApprovedBy', select: 'name' }]);
    const qrPayload = buildTravelOrderQrPayload(travelOrder);
    travelOrder.qrCode = await QRCode.toDataURL(JSON.stringify(qrPayload), { errorCorrectionLevel: 'M' });

    await travelOrder.save();

    // --- Notify HR Personnel (broadcast so mobile receives) ---
    const hrUsers = await User.find({ role: 'Human Resource Personnel' });
    for (const hrUser of hrUsers) {
      const newNotif = hrUser.notifications.create({
        message: `A travel order from ${travelOrder.employee.name} has been approved by the President and requires your review.`,
        type: 'Status Update',
        relatedId: travelOrder._id,
      });
      hrUser.notifications.push(newNotif);
      await hrUser.save();
      const payload = hrUser.notifications[hrUser.notifications.length - 1].toObject ? hrUser.notifications[hrUser.notifications.length - 1].toObject() : hrUser.notifications[hrUser.notifications.length - 1];
      req.io.emit('newNotification', { userId: hrUser._id.toString(), notification: payload });
    }

    // --- Real-time Update via Socket.IO ---
    req.io.emit('travelOrderDataChanged', travelOrder);

    res.json(travelOrder);
  } catch (error) {
    console.error('Error approving travel order by president:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all pending travel orders (for Recommenders)
router.get('/pending', [auth, authorize('Program Head', 'Faculty Dean')], async (req, res) => {
  try {
    const pendingOrders = await TravelOrder.find({ status: 'Pending' })
      .populate('employee', 'name email profilePicture role')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .select('employee travelOrderNo date address salary to purpose departureDate arrivalDate additionalInfo status recommendedBy approvedBy signature approverSignature employeeAddress recommenderSignatures recommendersWhoApproved participants');
    res.json(pendingOrders);
  } catch (error) {
    console.error('Error fetching pending travel orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update travel order status (for Recommenders, HR and President)
router.put('/:id/status', [auth, authorize('Program Head', 'Faculty Dean', 'Human Resource Personnel', 'President')], async (req, res) => {
  try {
    console.log(req.body);
    const { status, approverSignature, travelOrderNo, travelOrderNoSignature, departureSignature, arrivalSignature, rejectionReason } = req.body;
    
    // Recommenders (Program Head / Faculty Dean) can only recommend or reject
    // HR can approve, complete, or reject
    if (['Program Head', 'Faculty Dean'].includes(req.user.role)) {
      if (!['Recommended', 'Rejected'].includes(status)) {
        return res.status(400).json({ message: 'Recommenders can only recommend or reject travel orders.' });
      }
    } else if (req.user.role === 'Human Resource Personnel') {
      if (!['Approved', 'For President Approval', 'Completed', 'Rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status for HR personnel.' });
      }
    }

    const travelOrder = await TravelOrder.findById(req.params.id);
    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    const previousStatus = travelOrder.status;

    // Validate status transitions
    if (['Program Head', 'Faculty Dean'].includes(req.user.role)) {
      if (status === 'Recommended' && travelOrder.status !== 'Pending') {
        return res.status(400).json({ message: 'Recommenders can only recommend pending travel orders.' });
      }
      if (status === 'Recommended') {
        // Enforce Sequence
        if (!travelOrder.recommendersWhoApproved) travelOrder.recommendersWhoApproved = [];
        if (!travelOrder.recommenderSignatures) travelOrder.recommenderSignatures = [];
        if (!travelOrder.recommendedBy) travelOrder.recommendedBy = [];

        const currentApprovedCount = travelOrder.recommendersWhoApproved.length;
        const expectedNextRecommender = travelOrder.recommendedBy[currentApprovedCount];

        if (!expectedNextRecommender || expectedNextRecommender.toString() !== req.user.userId) {
          return res.status(403).json({ message: 'It is not yet your turn to recommend this travel order.' });
        }

        // Use string comparison: DB has ObjectIds, JWT has string; .includes(string) would always be false
        const alreadySigned = travelOrder.recommendersWhoApproved.some(
          (r) => r && r.toString() === req.user.userId
        );
        if (!alreadySigned) {
          travelOrder.recommendersWhoApproved.push(req.user.userId);
        }

        // Store individual signature
        travelOrder.recommenderSignatures.push({
          user: req.user.userId,
          signature: approverSignature
        });

        // Legacy support
        travelOrder.approverSignature = approverSignature; 

        // Check if all required recommenders have approved (use unique IDs in case of duplicates)
        const approvedIds = new Set(
          travelOrder.recommendersWhoApproved.map((r) => (r && r.toString()) || '')
        );
        const requiredIds = new Set(
          (travelOrder.recommendedBy || []).map((r) => (r && r.toString()) || '')
        );
        const allSigned =
          requiredIds.size > 0 &&
          [...requiredIds].every((id) => id && approvedIds.has(id));
        if (allSigned) {
          travelOrder.status = 'Recommended'; // All recommenders signed, now goes to HR
          // Notify HR that a travel order is ready for their review
          const hrUsers = await User.find({ role: 'Human Resource Personnel' });
          const employee = await User.findById(travelOrder.employee).select('name').lean();
          const employeeName = employee ? employee.name : 'An employee';
          for (const hrUser of hrUsers) {
            const newNotif = hrUser.notifications.create({
              message: `A travel order from ${employeeName} has been recommended by all chiefs and is ready for your review.`,
              type: 'New Travel Order',
              relatedId: travelOrder._id,
            });
            hrUser.notifications.push(newNotif);
            await hrUser.save();
            const payload = hrUser.notifications[hrUser.notifications.length - 1].toObject ? hrUser.notifications[hrUser.notifications.length - 1].toObject() : hrUser.notifications[hrUser.notifications.length - 1];
            req.io.emit('newNotification', { userId: hrUser._id.toString(), notification: payload });
          }
        } else {
          travelOrder.status = 'Pending'; // Still waiting for more recommenders
        }

      } else if (status === 'Rejected') {
        travelOrder.status = 'Rejected';
        if (rejectionReason != null) travelOrder.rejectionReason = String(rejectionReason).trim() || undefined;
      }
    } else if (req.user.role === 'Human Resource Personnel') {
      // HR approves Recommended orders and sends to President
      if (status === 'For President Approval' && travelOrder.status !== 'Recommended') {
        return res.status(400).json({ message: 'HR can only process travel orders that have been recommended by all chiefs.' });
      }
      if (status === 'Approved' && travelOrder.status !== 'President Approved') {
        return res.status(400).json({ message: 'HR can only approve travel orders that have been approved by the President.' });
      }
      
      if (status === 'For President Approval') {
          travelOrder.status = 'For President Approval';
          travelOrder.hrSignature = approverSignature;
          travelOrder.hrApprovedBy = req.user.userId;
      } else if (status === 'Approved') {
        travelOrder.approvedBy = req.user.userId; // HR finalizes
        travelOrder.status = 'Approved';
        // Server-generated Travel Order No if not provided
        if (travelOrderNo && String(travelOrderNo).trim()) {
          travelOrder.travelOrderNo = String(travelOrderNo).trim();
        } else {
          await ensureServerTravelOrderNo(travelOrder);
        }
        travelOrder.travelOrderNoSignature = travelOrderNoSignature;
        travelOrder.departureSignature = departureSignature;
        travelOrder.arrivalSignature = arrivalSignature;
        await travelOrder.populate([{ path: 'employee', select: 'name role' }, { path: 'recommendedBy', select: 'name' }, { path: 'approvedBy', select: 'name' }, { path: 'presidentApprovedBy', select: 'name' }]);
        const qrPayload = buildTravelOrderQrPayload(travelOrder);
        travelOrder.qrCode = await QRCode.toDataURL(JSON.stringify(qrPayload), { errorCorrectionLevel: 'M' });
      } else if (status === 'Completed') {
        if (travelOrder.status !== 'Returned' && travelOrder.status !== 'Approved') {
          return res.status(400).json({
            message:
              'HR can only complete travel orders that are approved (active) or returned from travel.',
          });
        }
        travelOrder.status = 'Completed';
        await travelOrder.populate([{ path: 'employee', select: 'name role' }, { path: 'recommendedBy', select: 'name' }, { path: 'approvedBy', select: 'name' }, { path: 'presidentApprovedBy', select: 'name' }]);
        const qrPayload = buildTravelOrderQrPayload(travelOrder);
        travelOrder.qrCode = await QRCode.toDataURL(JSON.stringify(qrPayload), { errorCorrectionLevel: 'M' });
      } else if (status === 'Rejected') {
        travelOrder.status = 'Rejected';
        travelOrder.approvedBy = req.user.userId;
        if (rejectionReason != null) travelOrder.rejectionReason = String(rejectionReason).trim() || undefined;
      }
    }
    
    await travelOrder.save();

    // --- Notify employee of status change (so they see progress in app and hear sound) ---
    const employeeUser = await User.findById(travelOrder.employee);
    if (employeeUser) {
      let statusMessage;
      if (status === 'Recommended') statusMessage = 'Your travel order has been recommended by all chiefs and is with HR for review.';
      else if (status === 'For President Approval') statusMessage = 'Your travel order has been sent for President approval.';
      else if (status === 'President Approved') statusMessage = 'The President has approved your travel order. It is now with HR for final approval.';
      else if (status === 'Approved') statusMessage = 'Your travel order has been approved.';
      else if (status === 'Completed') statusMessage = 'Your travel order has been completed.';
      else if (status === 'Rejected') statusMessage = travelOrder.rejectionReason ? `Your travel order was rejected: ${travelOrder.rejectionReason}` : 'Your travel order was rejected.';
      if (statusMessage) {
        const newNotif = employeeUser.notifications.create({ message: statusMessage, type: 'Status Update', relatedId: travelOrder._id });
        employeeUser.notifications.push(newNotif);
        await employeeUser.save();
        const payload = employeeUser.notifications[employeeUser.notifications.length - 1].toObject ? employeeUser.notifications[employeeUser.notifications.length - 1].toObject() : employeeUser.notifications[employeeUser.notifications.length - 1];
        req.io.emit('newNotification', { userId: employeeUser._id.toString(), notification: payload });
      }
    }

    // --- Notify President when HR sends a travel order for their approval ---
    if (status === 'For President Approval' && travelOrder.status === 'For President Approval') {
      const emp = await User.findById(travelOrder.employee).select('name').lean();
      const employeeName = emp?.name || 'An employee';
      await notifyUsersWithRole(req.io, 'President', {
        message: `A travel order from ${employeeName} requires your approval.`,
        type: 'Travel Order — President',
        relatedId: travelOrder._id,
      });
    }

    // --- If HR rejects while the order was waiting on the President, close the loop for them ---
    if (
      status === 'Rejected' &&
      req.user.role === 'Human Resource Personnel' &&
      previousStatus === 'For President Approval'
    ) {
      const emp = await User.findById(travelOrder.employee).select('name').lean();
      const employeeName = emp?.name || 'An employee';
      await notifyUsersWithRole(req.io, 'President', {
        message: `A travel order from ${employeeName} that was awaiting your approval has been rejected by HR.`,
        type: 'Travel Order — President',
        relatedId: travelOrder._id,
      });
    }

    // --- Real-time Update via Socket.IO ---
    req.io.emit('travelOrderDataChanged', travelOrder);

    res.json(travelOrder);
  } catch (error) {
    console.error('Error updating travel order status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get travel orders for the current user
router.get('/my-orders', auth, async (req, res) => {
  try {
    const userOrders = await TravelOrder.find({ employee: req.user.userId })
      .populate('employee', 'name profilePicture role employeeAddress')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name')
      .populate('recommendedBy', 'name faculty campus')
      .sort({ createdAt: -1 })
      .lean();
    res.json(userOrders);
  } catch (error) {
    console.error('Error fetching user travel orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a travel order
router.delete('/:id', auth, async (req, res) => {
  try {
    const travelOrder = await TravelOrder.findById(req.params.id);

    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    // Authorization check (similar to pass slips)
    if (travelOrder.employee.toString() !== req.user.userId && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'User not authorized to delete this travel order.' });
    }

    const deletableStatuses = ['Completed', 'Cancelled', 'Rejected'];
    if (!deletableStatuses.includes(travelOrder.status)) {
      return res.status(400).json({ message: 'Only completed, cancelled, or rejected travel orders can be deleted.' });
    }

    await travelOrder.deleteOne();

    // --- Real-time Update via Socket.IO ---
    req.io.emit('travelOrderDataChanged', { travelOrderId: req.params.id });

    res.json({ message: 'Travel order deleted successfully.' });
  } catch (error) {
    console.error('Error deleting travel order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all recommended travel orders (for HR) - Program Head recommended but HR not yet approved
router.get('/recommended', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    // Repair: any Pending order where all required recommenders have signed → set to Recommended
    const pendingOrders = await TravelOrder.find({
      status: 'Pending',
      recommendedBy: { $exists: true, $ne: [] }
    }).select('recommendersWhoApproved recommendedBy employee');
    for (const order of pendingOrders) {
      const approvedIds = new Set(
        (order.recommendersWhoApproved || []).map((r) => (r && r.toString()) || '')
      );
      const requiredIds = new Set(
        (order.recommendedBy || []).map((r) => (r && r.toString()) || '')
      );
      const allSigned =
        requiredIds.size > 0 &&
        [...requiredIds].every((id) => id && approvedIds.has(id));
      if (allSigned) {
        order.status = 'Recommended';
        await order.save();
        const hrUsers = await User.find({ role: 'Human Resource Personnel' });
        const employee = await User.findById(order.employee).select('name').lean();
        const employeeName = employee ? employee.name : 'An employee';
        for (const hrUser of hrUsers) {
          const newNotif = hrUser.notifications.create({
            message: `A travel order from ${employeeName} has been recommended by all chiefs and is ready for your review.`,
            type: 'New Travel Order',
            relatedId: order._id,
          });
          hrUser.notifications.push(newNotif);
          await hrUser.save();
          const payload = hrUser.notifications[hrUser.notifications.length - 1].toObject ? hrUser.notifications[hrUser.notifications.length - 1].toObject() : hrUser.notifications[hrUser.notifications.length - 1];
          req.io.emit('newNotification', { userId: hrUser._id.toString(), notification: payload });
        }
        req.io.emit('travelOrderDataChanged', order);
      }
    }

    const recommendedOrders = await TravelOrder.find({ status: 'Recommended' })
      .populate('employee', 'name email profilePicture')
      .populate('recommendedBy', 'name')
      .select('employee travelOrderNo date address salary to purpose departureDate arrivalDate additionalInfo status recommendedBy signature approverSignature latitude longitude routePolyline employeeAddress recommenderSignatures recommendersWhoApproved');
    res.json(recommendedOrders);
  } catch (error) {
    console.error('Error fetching recommended travel orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all President approved travel orders (ready for guard submission)
router.get('/hr-approved', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const hrApprovedOrders = await TravelOrder.find({ status: 'President Approved' })
      .populate('employee', 'name email profilePicture')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name')
      .select('employee travelOrderNo date address salary to purpose departureDate arrivalDate additionalInfo status recommendedBy approvedBy signature approverSignature employeeAddress presidentSignature presidentApprovedBy recommenderSignatures recommendersWhoApproved');
    res.json(hrApprovedOrders);
  } catch (error) {
    console.error('Error fetching HR approved travel orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all active approved travel orders (for HR monitoring)
router.get('/approved', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    // Repair older records that are already Approved but have no travelOrderNo.
    // Travel order number is required for approved documents; generate server-side when missing.
    const missingNumber = await TravelOrder.find({
      status: 'Approved',
      $or: [{ travelOrderNo: { $exists: false } }, { travelOrderNo: null }, { travelOrderNo: '' }]
    }).select('_id date travelOrderNo');
    for (const order of missingNumber) {
      try {
        await ensureServerTravelOrderNo(order);
        await order.save();
      } catch (e) {
        console.warn('Failed to auto-generate travelOrderNo for approved order:', order?._id?.toString?.(), e);
      }
    }

    const approvedOrders = await TravelOrder.find({ status: 'Approved' })
      .populate('employee', 'name email profilePicture')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name')
      .sort({ createdAt: -1 })
      .select('employee travelOrderNo date address salary to purpose departureDate arrivalDate additionalInfo status recommendedBy approvedBy signature approverSignature employeeAddress presidentSignature presidentApprovedBy recommenderSignatures recommendersWhoApproved');
    res.json(approvedOrders);
  } catch (error) {
    console.error('Error fetching approved travel orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get returned travel orders (for HR completion flow)
router.get('/returned', [auth, authorize('Human Resource Personnel')], async (req, res) => {
  try {
    const returnedOrders = await TravelOrder.find({ status: 'Returned' })
      .populate('employee', 'name email profilePicture')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name')
      .sort({ arrivalTime: -1, createdAt: -1 });
    res.json(returnedOrders);
  } catch (error) {
    console.error('Error fetching returned travel orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all verified travel orders (for Security)
router.get('/verified', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const verifiedOrders = await TravelOrder.find({ status: 'Verified' })
      .populate('employee', 'name email profilePicture role')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name')
      .sort({ departureTime: -1, createdAt: -1 });
    res.json(verifiedOrders);
  } catch (error) {
    console.error('Error fetching verified travel orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify a travel order departure (for Security)
router.put('/:id/verify', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const travelOrder = await TravelOrder.findById(req.params.id);
    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    if (travelOrder.status !== 'Approved') {
      return res.status(400).json({ message: 'Only approved travel orders can be verified for departure.' });
    }

    // Departure date/time restriction: cannot verify until scheduled departure date/time has been reached
    const parseTimeToDate = (timeStr, date) => {
      if (!timeStr || typeof timeStr !== 'string') return null;
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = (match[3] || '').toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const newDate = new Date(date);
      newDate.setHours(hours, minutes, 0, 0);
      return newDate;
    };
    let departureMoment = new Date(travelOrder.departureDate);
    if (travelOrder.timeOut) {
      const withTime = parseTimeToDate(travelOrder.timeOut, travelOrder.departureDate);
      if (withTime) departureMoment = withTime;
      else departureMoment.setHours(0, 0, 0, 0);
    } else {
      departureMoment.setHours(0, 0, 0, 0);
    }
    if (new Date() < departureMoment) {
      return res.status(400).json({
        message: 'Cannot verify departure yet. Verification is allowed only at or after the scheduled departure date and time.',
      });
    }

    travelOrder.status = 'Verified';
    travelOrder.departureTime = new Date();
    await travelOrder.save();

    req.io.emit('travelOrderDataChanged', travelOrder);
    res.json(travelOrder);
  } catch (error) {
    console.error('Error verifying travel order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark a travel order as Returned (Security or the employee who owns it)
router.put('/return/:id', auth, async (req, res) => {
  try {
    const travelOrder = await TravelOrder.findById(req.params.id);
    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    const currentUserId = String(req.user.userId || req.user.id || '');
    const employeeId = travelOrder.employee ? String(travelOrder.employee) : '';
    const isSecurity = req.user.role === 'Security Personnel';
    const isEmployee = currentUserId && employeeId && currentUserId === employeeId;
    if (!isSecurity && !isEmployee) {
      return res.status(403).json({ message: 'Only security or the employee on this travel order can mark return.' });
    }

    if (travelOrder.status !== 'Verified') {
      return res.status(400).json({ message: 'Only verified travel orders can be marked as returned.' });
    }

    travelOrder.status = 'Returned';
    travelOrder.arrivalTime = new Date();
    await travelOrder.save();

    // Notify HR that document is ready for completion
    const hrUsers = await User.find({ role: 'Human Resource Personnel' });
    for (const hrUser of hrUsers) {
      const newNotif = hrUser.notifications.create({
        message: 'A travel order has been marked as returned and is ready for completion.',
        type: 'Status Update',
        relatedId: travelOrder._id,
      });
      hrUser.notifications.push(newNotif);
      await hrUser.save();
      const payload = hrUser.notifications[hrUser.notifications.length - 1].toObject ? hrUser.notifications[hrUser.notifications.length - 1].toObject() : hrUser.notifications[hrUser.notifications.length - 1];
      req.io.emit('newNotification', { userId: hrUser._id.toString(), notification: payload });
    }

    req.io.emit('travelOrderDataChanged', travelOrder);
    res.json(travelOrder);
  } catch (error) {
    console.error('Error marking travel order as returned:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Legacy path (same behavior): /:id/return
router.put('/:id/return', auth, async (req, res) => {
  try {
    const travelOrder = await TravelOrder.findById(req.params.id);
    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    const currentUserId = String(req.user.userId || req.user.id || '');
    const employeeId = travelOrder.employee ? String(travelOrder.employee) : '';
    const isSecurity = req.user.role === 'Security Personnel';
    const isEmployee = currentUserId && employeeId && currentUserId === employeeId;
    if (!isSecurity && !isEmployee) {
      return res.status(403).json({ message: 'Only security or the employee on this travel order can mark return.' });
    }

    if (travelOrder.status !== 'Verified') {
      return res.status(400).json({ message: 'Only verified travel orders can be marked as returned.' });
    }

    travelOrder.status = 'Returned';
    travelOrder.arrivalTime = new Date();
    await travelOrder.save();

    req.io.emit('travelOrderDataChanged', travelOrder);
    res.json(travelOrder);
  } catch (error) {
    console.error('Error marking travel order as returned:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single travel order by ID (for Security)
router.get('/:id', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const travelOrder = await TravelOrder.findById(req.params.id)
      .populate('employee', 'name email profilePicture role')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name');

    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    res.json(travelOrder);
  } catch (error) {
    console.error('Error fetching travel order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
