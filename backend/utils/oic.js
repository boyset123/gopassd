const mongoose = require('mongoose');
const User = require('../models/User');
const TravelOrder = require('../models/TravelOrder');

/**
 * Roles whose role-position one rank below is well-defined and can be enforced
 * as the Primary OIC pool.
 */
const RANK_BELOW_BY_ROLE = {
  President: ['Vice President'],
  'Faculty Dean': ['Program Head'],
  'Program Head': ['Faculty Staff'],
};

/**
 * Roles that may assign an OIC and use the on-travel manual toggle.
 */
const OIC_CAPABLE_ROLES = new Set(['President', 'Faculty Dean', 'Program Head']);

/**
 * Roles excluded from the "any user" Fallback OIC pool to avoid nonsensical picks.
 */
const FALLBACK_EXCLUDED_ROLES = new Set(['admin', 'Security Personnel']);

function isOicCapableRole(role) {
  return OIC_CAPABLE_ROLES.has(role);
}

function getRankBelowRoles(role) {
  return RANK_BELOW_BY_ROLE[role] || [];
}

function toIdString(id) {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (id._id) return id._id.toString();
  if (typeof id.toString === 'function') return id.toString();
  return null;
}

/**
 * Returns true when a user has an active (currently travelling) approved travel order.
 */
async function hasActiveApprovedTravelOrder(userId, when = new Date()) {
  if (!userId) return false;
  const order = await TravelOrder.findOne({
    employee: userId,
    status: { $in: ['Approved', 'President Approved', 'Verified'] },
    departureDate: { $lte: when },
    arrivalDate: { $gte: when },
  }).select('_id departureDate arrivalDate travelOrderNo').lean();
  return order ? { _id: order._id, travelOrderNo: order.travelOrderNo } : null;
}

/**
 * Determines whether a user should currently be considered "on travel".
 * Manual override + automatic detection from active approved Travel Orders.
 */
async function isUserOnTravel(userOrId) {
  if (!userOrId) return { onTravel: false };
  const now = new Date();
  let user = userOrId;
  if (typeof userOrId === 'string' || userOrId instanceof mongoose.Types.ObjectId) {
    user = await User.findById(userOrId).select('onTravelManual onTravelManualUntil').lean();
    if (!user) return { onTravel: false };
  }

  const manualActive =
    user.onTravelManual === true &&
    (!user.onTravelManualUntil || new Date(user.onTravelManualUntil) >= now);

  if (manualActive) {
    return { onTravel: true, reason: 'manual', until: user.onTravelManualUntil || null };
  }

  const userId = user._id || userOrId;
  const auto = await hasActiveApprovedTravelOrder(userId, now);
  if (auto) {
    return { onTravel: true, reason: 'travel-order', travelOrderId: auto._id, travelOrderNo: auto.travelOrderNo };
  }

  return { onTravel: false };
}

/**
 * Returns the user who should currently sign in place of `originalUserId`.
 * Resolution order: original (if not on travel) -> oicPrimary -> oicFallback.
 * Returns { signerId, originalId, viaOic, signer } where viaOic is null|'primary'|'fallback'.
 * Falls back to the original signer if no OIC is available (caller can still reject).
 */
async function getEffectiveSigner(originalUserId) {
  if (!originalUserId) return null;

  const original = await User.findById(originalUserId)
    .select('_id name role faculty oicPrimary oicFallback onTravelManual onTravelManualUntil')
    .lean();
  if (!original) return null;

  const originalStatus = await isUserOnTravel(original);
  if (!originalStatus.onTravel) {
    return {
      signerId: original._id,
      originalId: original._id,
      viaOic: null,
      signer: original,
      original,
    };
  }

  if (original.oicPrimary) {
    const primary = await User.findById(original.oicPrimary)
      .select('_id name role faculty onTravelManual onTravelManualUntil')
      .lean();
    if (primary) {
      const primaryStatus = await isUserOnTravel(primary);
      if (!primaryStatus.onTravel) {
        return {
          signerId: primary._id,
          originalId: original._id,
          viaOic: 'primary',
          signer: primary,
          original,
        };
      }
    }
  }

  if (original.oicFallback) {
    const fallback = await User.findById(original.oicFallback)
      .select('_id name role faculty onTravelManual onTravelManualUntil')
      .lean();
    if (fallback) {
      const fallbackStatus = await isUserOnTravel(fallback);
      if (!fallbackStatus.onTravel) {
        return {
          signerId: fallback._id,
          originalId: original._id,
          viaOic: 'fallback',
          signer: fallback,
          original,
        };
      }
    }
  }

  // No usable delegate; return original as the (unavailable) signer.
  return {
    signerId: original._id,
    originalId: original._id,
    viaOic: null,
    signer: original,
    original,
    noDelegateAvailable: true,
  };
}

/**
 * The President account for signing / attachment access.
 * Prefer the logged-in user when their JWT role is President (avoids findOne picking the wrong user).
 */
async function resolvePresidentAccount(reqUser) {
  if (!reqUser) return null;
  const uid = toIdString(reqUser.userId || reqUser.id);
  if (uid && reqUser.role === 'President') {
    const self = await User.findById(uid).select('_id name role').lean();
    if (self?.role === 'President') return self;
  }
  return User.findOne({ role: 'President' }).select('_id name role').lean();
}

/**
 * Validates that `actingUserId` is allowed to sign in place of `originalUserId`.
 * Returns the resolution object if allowed; throws an Error with .status otherwise.
 */
async function assertCanSignFor(actingUserId, originalUserId) {
  const resolution = await getEffectiveSigner(originalUserId);
  if (!resolution) {
    const err = new Error('Original signer not found.');
    err.status = 404;
    throw err;
  }

  const actingStr = toIdString(actingUserId);
  const expectedStr = toIdString(resolution.signerId);

  if (actingStr === expectedStr) return resolution;

  // Allow original signer to sign even if marked on travel but no OIC is set.
  if (
    resolution.noDelegateAvailable &&
    actingStr === toIdString(resolution.originalId)
  ) {
    return resolution;
  }

  const err = new Error('It is not your turn to sign this document.');
  err.status = 403;
  throw err;
}

/**
 * Build a Mongo filter that selects users currently in the "rank-below" pool for
 * the given user. Faculty Dean and Program Head are scoped to the same `faculty`.
 */
function buildPrimaryCandidateFilter(user) {
  const roles = getRankBelowRoles(user.role);
  if (roles.length === 0) return null;

  const filter = { role: { $in: roles }, _id: { $ne: user._id } };
  // Faculty-scoped roles
  if (user.role === 'Faculty Dean' || user.role === 'Program Head') {
    if (user.faculty) {
      filter.faculty = user.faculty;
    }
  }
  return filter;
}

/**
 * Build a Mongo filter for the Fallback "any user" pool, excluding admin/security and self.
 */
function buildFallbackCandidateFilter(user) {
  return {
    _id: { $ne: user._id },
    role: { $nin: Array.from(FALLBACK_EXCLUDED_ROLES) },
  };
}

/**
 * Returns the set of distinct roles for which `userId` is currently the
 * effective OIC (i.e., a user with that role has assigned `userId` as their
 * oicPrimary/oicFallback AND is currently on travel AND `userId` resolves as
 * the active signer via OIC). Used by the mobile shell to decide which
 * dashboard tabs to surface for a user temporarily standing in for an
 * on-travel approver.
 */
async function getActiveOicForRoles(userId) {
  if (!userId) return [];
  const delegators = await User.find({
    $or: [{ oicPrimary: userId }, { oicFallback: userId }],
  })
    .select('_id role')
    .lean();

  const roles = new Set();
  for (const d of delegators) {
    const resolution = await getEffectiveSigner(d._id);
    if (
      resolution &&
      toIdString(resolution.signerId) === toIdString(userId) &&
      resolution.viaOic &&
      d.role
    ) {
      roles.add(d.role);
    }
  }
  return Array.from(roles);
}

module.exports = {
  RANK_BELOW_BY_ROLE,
  OIC_CAPABLE_ROLES,
  FALLBACK_EXCLUDED_ROLES,
  isOicCapableRole,
  getRankBelowRoles,
  isUserOnTravel,
  hasActiveApprovedTravelOrder,
  getEffectiveSigner,
  resolvePresidentAccount,
  assertCanSignFor,
  buildPrimaryCandidateFilter,
  buildFallbackCandidateFilter,
  getActiveOicForRoles,
  toIdString,
};
