/** Weekly pass-slip cap (2 hours). */
const WEEKLY_LIMIT_SECONDS = 7200;
const DEFAULT_PASS_SLIP_SECONDS = 7200;

/**
 * Resolve stored balance in seconds. passSlipSeconds is the source of truth when set;
 * passSlipMinutes is a legacy fallback when seconds is missing.
 */
function getPassSlipSeconds(user) {
  if (!user) return 0;

  const secondsRaw =
    typeof user.passSlipSeconds === 'number' && !Number.isNaN(user.passSlipSeconds)
      ? Math.max(0, Math.floor(user.passSlipSeconds))
      : null;
  const minutes =
    typeof user.passSlipMinutes === 'number' && !Number.isNaN(user.passSlipMinutes)
      ? Math.max(0, Math.floor(user.passSlipMinutes))
      : null;

  if (secondsRaw == null) {
    return (minutes ?? 0) * 60;
  }
  if (minutes == null) {
    return secondsRaw;
  }

  // Legacy: seconds field accidentally stored as whole minutes (e.g. 90 meaning 90 min).
  if (secondsRaw === minutes && secondsRaw <= 120) {
    return minutes * 60;
  }

  // passSlipSeconds is canonical; passSlipMinutes is a floored view kept in sync by setPassSlipSeconds.
  return secondsRaw;
}

/** Raw stored seconds for balance mutations (never applies legacy minute-only overrides). */
function getStoredPassSlipSeconds(user) {
  if (!user) return 0;
  if (typeof user.passSlipSeconds === 'number' && !Number.isNaN(user.passSlipSeconds)) {
    return Math.max(0, Math.floor(user.passSlipSeconds));
  }
  if (typeof user.passSlipMinutes === 'number' && !Number.isNaN(user.passSlipMinutes)) {
    return Math.max(0, Math.floor(user.passSlipMinutes)) * 60;
  }
  return 0;
}

function setPassSlipSeconds(user, seconds) {
  const normalized = Math.max(0, Math.floor(Number(seconds) || 0));
  user.passSlipSeconds = normalized;
  user.passSlipMinutes = Math.floor(normalized / 60);
  return normalized;
}

function serializePassSlipBalance(user) {
  const passSlipSeconds = getPassSlipSeconds(user);
  return {
    passSlipSeconds,
    passSlipMinutes: Math.floor(passSlipSeconds / 60),
  };
}

module.exports = {
  WEEKLY_LIMIT_SECONDS,
  DEFAULT_PASS_SLIP_SECONDS,
  getPassSlipSeconds,
  getStoredPassSlipSeconds,
  setPassSlipSeconds,
  serializePassSlipBalance,
};
