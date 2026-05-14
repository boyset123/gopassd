const express = require('express');
const router = express.Router();
const TravelOrder = require('../models/TravelOrder');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const User = require('../models/User');
const TravelOrderCounter = require('../models/TravelOrderCounter');
const QRCode = require('qrcode');
const { parseLocalDate, parseMeridiemTimeToDate } = require('../utils/dateTime');
const { getEffectiveSigner, toIdString } = require('../utils/oic');
const { travelOrderToClientJson, travelOrdersToClientJson } = require('../utils/travelOrderSerialize');
const multer = require('multer');
const storage = multer.memoryStorage();
const mongoose = require('mongoose');
const {
  isConfigured: isCloudinaryForTravelOrdersConfigured,
  uploadTravelOrderAttachment,
  signedDeliveryUrl,
  resourceTypeForMime,
  destroyTravelOrderUpload,
} = require('../lib/cloudinaryTravelOrder');

const ALLOWED_SUPPORTING_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/pjpeg',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_SUPPORTING_FILES = 15;

const uploadSupporting = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_SUPPORTING_FILES + 1 },
}).fields([
  { name: 'documents', maxCount: MAX_SUPPORTING_FILES },
  { name: 'document', maxCount: 1 },
]);

// List routes: exclude only binary fields. Inclusive projections like `documents.name` can yield
// empty subdocuments in Mongoose, so HR/clients never receive attachment metadata.

function normalizeSupportingMime(file) {
  let mt = (file.mimetype || '').toLowerCase();
  const orig = (file.originalname || '').toLowerCase();
  if (!ALLOWED_SUPPORTING_MIMES.has(mt)) {
    if (orig.endsWith('.docx')) {
      mt = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (orig.endsWith('.pdf')) {
      mt = 'application/pdf';
    }
  }
  return mt;
}

async function canViewSupportingDocument(reqUser, travelOrderLean) {
  if (!reqUser || !travelOrderLean) return false;
  const uid = toIdString(reqUser.userId || reqUser.id);
  if (!uid) return false;

  const empId = toIdString(travelOrderLean.employee?._id || travelOrderLean.employee);
  if (empId && empId === uid) return true;

  const role = reqUser.role;
  if (role === 'Admin') return true;
  if (role === 'Human Resource Personnel') return true;
  if (role === 'Security Personnel') return true;

  const recs = travelOrderLean.recommendedBy || [];
  for (const r of recs) {
    const rid = toIdString(r?._id || r);
    if (!rid) continue;
    if (rid === uid) return true;
    const resolution = await getEffectiveSigner(rid);
    if (resolution && toIdString(resolution.signerId) === uid) return true;
  }

  const president = await User.findOne({ role: 'President' }).select('_id').lean();
  if (president?._id) {
    const resolution = await getEffectiveSigner(president._id);
    if (resolution && toIdString(resolution.signerId) === uid) return true;
  }

  const sigs = travelOrderLean.recommenderSignatures || [];
  for (const s of sigs) {
    const signerId = toIdString(s.user?._id || s.user);
    if (signerId && signerId === uid) return true;
  }

  return false;
}

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
router.post(
  '/',
  auth,
  (req, res, next) => {
    uploadSupporting(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'Each supporting file must be 5 MB or smaller.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: 'Too many supporting files attached.' });
        }
      }
      next(err);
    });
  },
  async (req, res) => {
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

    const fileList = [];
    if (req.files && Array.isArray(req.files.documents)) {
      fileList.push(...req.files.documents);
    }
    if (req.files && Array.isArray(req.files.document)) {
      fileList.push(...req.files.document);
    }

    if (fileList.length > MAX_SUPPORTING_FILES) {
      return res.status(400).json({
        message: `You can attach at most ${MAX_SUPPORTING_FILES} supporting files.`,
      });
    }

    if (fileList.length > 0) {
      if (!isCloudinaryForTravelOrdersConfigured()) {
        return res.status(503).json({
          message:
            'Supporting file uploads require Cloudinary. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
        });
      }
      const orderId = new mongoose.Types.ObjectId();
      travelOrderData._id = orderId;
      travelOrderData.documents = [];
      let fileIndex = 0;
      for (const file of fileList) {
        const mt = normalizeSupportingMime(file);
        if (!ALLOWED_SUPPORTING_MIMES.has(mt)) {
          for (const d of travelOrderData.documents) {
            if (d.publicId) {
              try {
                await destroyTravelOrderUpload(d.publicId, d.resourceType);
              } catch (e) {
                console.warn('Cloudinary rollback destroy failed:', e?.message || e);
              }
            }
          }
          return res.status(400).json({
            message: 'Only PDF, Word (.docx), and image files are allowed for supporting documents.',
          });
        }
        try {
          const uploaded = await uploadTravelOrderAttachment(file.buffer, {
            orderId: orderId.toString(),
            fileIndex,
            mimeType: mt,
            originalName: file.originalname,
          });
          travelOrderData.documents.push({
            publicId: uploaded.publicId,
            resourceType: uploaded.resourceType,
            format: uploaded.format,
            contentType: mt,
            name: file.originalname,
          });
        } catch (uploadErr) {
          console.error('Cloudinary travel-order upload failed:', uploadErr);
          for (const d of travelOrderData.documents) {
            if (d.publicId) {
              try {
                await destroyTravelOrderUpload(d.publicId, d.resourceType);
              } catch (e) {
                console.warn('Cloudinary rollback destroy failed:', e?.message || e);
              }
            }
          }
          return res.status(502).json({
            message: 'Could not store supporting files. Try again later or contact support.',
          });
        }
        fileIndex += 1;
      }
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
    req.io.emit('travelOrderDataChanged', travelOrderToClientJson(travelOrder));

    res.status(201).json(travelOrderToClientJson(travelOrder));
  } catch (error) {
    console.error('Error creating travel order:', error);
    res.status(500).json({ message: 'Server error' });
  }
  }
);


// Get all travel orders for president approval (also accessible to anyone acting as OIC for the President)
router.get('/for-president-approval', [auth], async (req, res) => {
  try {
    const forPresidentApprovalOrders = await TravelOrder.find({ status: 'For President Approval' })
      .populate('employee', 'name email profilePicture role')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role')
      .select('-document.data -documents.data')
      .lean();

    // Resolve the current effective president signer once, since every doc here is "for President".
    const president = await User.findOne({ role: 'President' }).select('_id').lean();
    let presidentSigner = null;
    if (president) {
      const resolution = await getEffectiveSigner(president._id);
      if (resolution) {
        presidentSigner = {
          originalId: resolution.originalId,
          originalName: resolution.original?.name || null,
          signerId: resolution.signerId,
          signerName: resolution.signer?.name || null,
          viaOic: resolution.viaOic,
          noDelegateAvailable: !!resolution.noDelegateAvailable,
        };
      }
    }

    const annotated = forPresidentApprovalOrders.map((o) => {
      const obj = o && typeof o === 'object' ? { ...o } : o;
      if (presidentSigner) obj.nextSigner = presidentSigner;
      return travelOrderToClientJson(obj);
    });

    res.json(annotated);
  } catch (error) {
    console.error('Error fetching travel orders for president approval:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve a travel order (for President or their currently-acting OIC)
router.put('/:id/approve-president', [auth], async (req, res) => {
  try {
    const { approverSignature } = req.body;

    const travelOrder = await TravelOrder.findById(req.params.id).populate('employee', 'name');
    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    if (travelOrder.status !== 'For President Approval') {
      return res.status(400).json({ message: 'Only travel orders submitted for president approval can be approved.' });
    }

    // Resolve the effective signer (President or their current OIC) and authorize.
    const president = await User.findOne({ role: 'President' }).select('_id').lean();
    if (!president) {
      return res.status(500).json({ message: 'No President configured in the system.' });
    }
    const resolution = await getEffectiveSigner(president._id);
    if (!resolution) {
      return res.status(500).json({ message: 'Unable to resolve effective signer for the President.' });
    }
    const expectedSignerId = toIdString(resolution.signerId);
    if (toIdString(req.user.userId) !== expectedSignerId) {
      return res.status(403).json({
        message: resolution.viaOic
          ? 'Only the assigned OIC for the President can sign while the President is on travel.'
          : 'Only the President can sign this travel order.',
      });
    }

    travelOrder.status = 'President Approved';
    travelOrder.presidentApprovedBy = req.user.userId;
    travelOrder.presidentSignature = approverSignature;
    travelOrder.presidentSignedAsOicFor = resolution.viaOic ? resolution.originalId : null;

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
    req.io.emit('travelOrderDataChanged', travelOrderToClientJson(travelOrder));

    res.json(travelOrderToClientJson(travelOrder));
  } catch (error) {
    console.error('Error approving travel order by president:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all pending travel orders (for Recommenders and any OIC standing in for them)
router.get('/pending', [auth], async (req, res) => {
  try {
    const pendingOrders = await TravelOrder.find({ status: 'Pending' })
      .populate('employee', 'name email profilePicture role')
      .populate('recommendedBy', 'name role faculty')
      .populate('approvedBy', 'name')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role')
      .select('-document.data -documents.data')
      .lean();

    // Annotate each order with the next expected recommender's effective signer info,
    // so clients can show "Acting as OIC for X" badges and filter to their queue.
    const annotated = await Promise.all(
      pendingOrders.map(async (order) => {
        const obj = { ...order };
        const approvedCount = Array.isArray(obj.recommendersWhoApproved) ? obj.recommendersWhoApproved.length : 0;
        const expectedNext = Array.isArray(obj.recommendedBy) ? obj.recommendedBy[approvedCount] : null;
        if (expectedNext && expectedNext._id) {
          const resolution = await getEffectiveSigner(expectedNext._id);
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
        return travelOrderToClientJson(obj);
      })
    );

    res.json(annotated);
  } catch (error) {
    console.error('Error fetching pending travel orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update travel order status (for Recommenders, their OICs, HR, and President)
router.put('/:id/status', [auth], async (req, res) => {
  try {
    console.log(req.body);
    const { status, approverSignature, travelOrderNo, travelOrderNoSignature, departureSignature, arrivalSignature, rejectionReason } = req.body;

    const travelOrder = await TravelOrder.findById(req.params.id);
    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    const previousStatus = travelOrder.status;

    // Determine actor scope: are we acting as a recommender (or their OIC) or as HR?
    const isHr = req.user.role === 'Human Resource Personnel';

    // Whitelist of allowed transitions per role group.
    if (isHr) {
      if (!['Approved', 'For President Approval', 'Completed', 'Rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status for HR personnel.' });
      }
    } else {
      if (!['Recommended', 'Rejected'].includes(status)) {
        return res.status(400).json({ message: 'Recommenders can only recommend or reject travel orders.' });
      }
    }

    // Validate status transitions
    if (!isHr) {
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

        if (!expectedNextRecommender) {
          return res.status(403).json({ message: 'It is not yet your turn to recommend this travel order.' });
        }

        // Resolve effective signer (allows the configured OIC to sign while the recommender is on travel).
        const resolution = await getEffectiveSigner(expectedNextRecommender);
        if (!resolution) {
          return res.status(404).json({ message: 'Recommender not found.' });
        }
        const expectedSignerId = toIdString(resolution.signerId);
        if (toIdString(req.user.userId) !== expectedSignerId) {
          return res.status(403).json({
            message: resolution.viaOic
              ? 'Only the assigned OIC can sign while this recommender is on travel.'
              : 'It is not yet your turn to recommend this travel order.',
          });
        }

        // Track the original recommender slot as completed (preserves sequencing order).
        const originalRecommenderId = toIdString(expectedNextRecommender);
        const alreadySigned = travelOrder.recommendersWhoApproved.some(
          (r) => r && r.toString() === originalRecommenderId
        );
        if (!alreadySigned) {
          travelOrder.recommendersWhoApproved.push(expectedNextRecommender);
        }

        // Store individual signature with OIC metadata when applicable
        travelOrder.recommenderSignatures.push({
          user: req.user.userId,
          signature: approverSignature,
          signedAsOicFor: resolution.viaOic ? resolution.originalId : null,
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
        // Only listed recommenders or their currently-acting OIC may reject.
        const recIds = (travelOrder.recommendedBy || []).map((r) => toIdString(r));
        let allowed = recIds.includes(toIdString(req.user.userId));
        if (!allowed) {
          for (const recId of recIds) {
            const resolution = await getEffectiveSigner(recId);
            if (resolution && toIdString(resolution.signerId) === toIdString(req.user.userId)) {
              allowed = true;
              break;
            }
          }
        }
        if (!allowed) {
          return res.status(403).json({ message: 'Only a recommender or their OIC can reject this travel order.' });
        }
        travelOrder.status = 'Rejected';
        if (rejectionReason != null) travelOrder.rejectionReason = String(rejectionReason).trim() || undefined;
      }
    } else if (isHr) {
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
    req.io.emit('travelOrderDataChanged', travelOrderToClientJson(travelOrder));

    res.json(travelOrderToClientJson(travelOrder));
  } catch (error) {
    console.error('Error updating travel order status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get travel orders for the current user
router.get('/my-orders', auth, async (req, res) => {
  try {
    const userOrders = await TravelOrder.find({ employee: req.user.userId })
      .select('-document.data -documents.data')
      .populate('employee', 'name profilePicture role employeeAddress')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name')
      .populate('presidentSignedAsOicFor', 'name role')
      .populate('recommendedBy', 'name faculty campus')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role')
      .sort({ createdAt: -1 })
      .lean();
    res.json(travelOrdersToClientJson(userOrders));
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
        req.io.emit('travelOrderDataChanged', travelOrderToClientJson(order));
      }
    }

    const recommendedOrders = await TravelOrder.find({ status: 'Recommended' })
      .populate('employee', 'name email profilePicture')
      .populate('recommendedBy', 'name')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role')
      .sort({ createdAt: -1 })
      .select('-document.data -documents.data')
      .lean();
    res.json(travelOrdersToClientJson(recommendedOrders));
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
      .populate('presidentSignedAsOicFor', 'name role')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role')
      .select('-document.data -documents.data')
      .lean();
    res.json(travelOrdersToClientJson(hrApprovedOrders));
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
      .populate('presidentSignedAsOicFor', 'name role')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role')
      .sort({ createdAt: -1 })
      .select('-document.data -documents.data')
      .lean();
    res.json(travelOrdersToClientJson(approvedOrders));
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
      .populate('presidentSignedAsOicFor', 'name role')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role')
      .select('-document.data -documents.data')
      .sort({ arrivalTime: -1, createdAt: -1 })
      .lean();
    res.json(travelOrdersToClientJson(returnedOrders));
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
      .populate('presidentSignedAsOicFor', 'name role')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role')
      .select('-document.data -documents.data')
      .sort({ departureTime: -1, createdAt: -1 })
      .lean();
    res.json(travelOrdersToClientJson(verifiedOrders));
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
    let departureMoment = parseLocalDate(travelOrder.departureDate);
    if (!departureMoment) {
      return res.status(400).json({ message: 'Invalid departure date on travel order.' });
    }
    if (travelOrder.timeOut) {
      const withTime = parseMeridiemTimeToDate(travelOrder.timeOut, travelOrder.departureDate);
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

    req.io.emit('travelOrderDataChanged', travelOrderToClientJson(travelOrder));
    res.json(travelOrderToClientJson(travelOrder));
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

    req.io.emit('travelOrderDataChanged', travelOrderToClientJson(travelOrder));
    res.json(travelOrderToClientJson(travelOrder));
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

    req.io.emit('travelOrderDataChanged', travelOrderToClientJson(travelOrder));
    res.json(travelOrderToClientJson(travelOrder));
  } catch (error) {
    console.error('Error marking travel order as returned:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Supporting document (PDF / Word / image). Authorized for employee, signatory chain, HR, security, admin.
router.get('/:id/supporting-document', auth, async (req, res) => {
  try {
    const rawIndex = parseInt(String(req.query.index ?? '0'), 10);
    const index = Number.isFinite(rawIndex) && rawIndex >= 0 ? rawIndex : 0;

    const travelOrder = await TravelOrder.findById(req.params.id)
      .select('document documents employee recommendedBy recommenderSignatures')
      .populate('recommendedBy', '_id')
      .populate({ path: 'recommenderSignatures.user', select: '_id' })
      .lean();

    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    const fileSlots = [];
    if (Array.isArray(travelOrder.documents) && travelOrder.documents.length > 0) {
      for (const d of travelOrder.documents) {
        if (d) fileSlots.push(d);
      }
    } else if (travelOrder.document && (travelOrder.document.data || travelOrder.document.publicId)) {
      fileSlots.push(travelOrder.document);
    }

    if (fileSlots.length === 0) {
      return res.status(404).json({ message: 'No supporting document on this travel order.' });
    }

    const doc = fileSlots[index];
    if (!doc) {
      return res.status(404).json({ message: 'Supporting file not found at this index.' });
    }

    const allowed = await canViewSupportingDocument(req.user, travelOrder);
    if (!allowed) {
      return res.status(403).json({ message: 'Not authorized to view this supporting document.' });
    }

    if (doc.publicId && String(doc.publicId).trim()) {
      if (!isCloudinaryForTravelOrdersConfigured()) {
        return res.status(503).json({ message: 'Cloudinary is not configured; cannot serve this attachment.' });
      }
      const rt =
        doc.resourceType === 'image' || doc.resourceType === 'raw'
          ? doc.resourceType
          : resourceTypeForMime(doc.contentType);
      const url = signedDeliveryUrl(doc.publicId, rt);
      return res.redirect(302, url);
    }

    const buf = doc.data;
    if (!buf || (Buffer.isBuffer(buf) ? buf.length === 0 : !buf.length)) {
      return res.status(404).json({ message: 'Supporting file not found at this index.' });
    }

    const rawName = doc.name || 'attachment';
    const filename = String(rawName).replace(/[^\w.\- ]+/g, '_').slice(0, 200);
    res.setHeader('Content-Type', doc.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(Buffer.isBuffer(buf) ? buf : Buffer.from(buf.data || buf));
  } catch (error) {
    console.error('Error serving travel order supporting document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single travel order by ID (for Security)
router.get('/:id', [auth, authorize('Security Personnel')], async (req, res) => {
  try {
    const travelOrder = await TravelOrder.findById(req.params.id)
      .select('-document.data -documents.data')
      .populate('employee', 'name email profilePicture role')
      .populate('recommendedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('presidentApprovedBy', 'name')
      .populate('presidentSignedAsOicFor', 'name role')
      .populate('recommenderSignatures.user', 'name role')
      .populate('recommenderSignatures.signedAsOicFor', 'name role');

    if (!travelOrder) {
      return res.status(404).json({ message: 'Travel order not found.' });
    }

    res.json(travelOrderToClientJson(travelOrder));
  } catch (error) {
    console.error('Error fetching travel order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
