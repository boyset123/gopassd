/** Weekly pass-slip cap (2 hours). */
const WEEKLY_LIMIT_SECONDS = 7200;
const DEFAULT_PASS_SLIP_SECONDS = 7200;

/**
 * Resolve stored balance in seconds (migrates legacy passSlipMinutes when needed).
 */
function getPassSlipSeconds(user) {
  if (!user) return 0;

  const minutes =
    typeof user.passSlipMinutes === 'number' && !Number.isNaN(user.passSlipMinutes)
      ? Math.max(0, Math.floor(user.passSlipMinutes))
      : null;
  const secondsRaw =
    typeof user.passSlipSeconds === 'number' && !Number.isNaN(user.passSlipSeconds)
      ? Math.max(0, Math.floor(user.passSlipSeconds))
      : null;

  if (secondsRaw == null) {
    return (minutes ?? 0) * 60;
  }
  if (minutes == null) {
    return secondsRaw;
  }

  const fromMinutes = minutes * 60;
  // Seconds field accidentally stored as whole minutes.
  if (secondsRaw === minutes && secondsRaw <= 120) {
    return fromMinutes;
  }
  // passSlipMinutes is the floored minute view of passSlipSeconds.
  if (Math.floor(secondsRaw / 60) === minutes) {
    return secondsRaw;
  }
  // Stale weekly-cap seconds while minutes reflect actual remaining time.
  if (secondsRaw >= DEFAULT_PASS_SLIP_SECONDS && fromMinutes < secondsRaw) {
    return fromMinutes;
  }
  return secondsRaw;
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
  setPassSlipSeconds,
  serializePassSlipBalance,
};
