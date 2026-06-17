/** Format pass-slip balance in seconds (e.g. 45 -> "45s", 3661 -> "1h 1m 1s"). */
export function formatPassSlipBalance(totalSecondsInput: number | undefined | null): string {
  const total = Math.max(0, Math.floor(Number(totalSecondsInput) || 0));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours === 0) return `${mins}m ${secs}s`;
  return `${hours}h ${mins}m ${secs}s`;
}

/** Resolve balance seconds from API payload. passSlipSeconds is canonical when set. */
export function getPassSlipBalanceSeconds(user: {
  passSlipSeconds?: number;
  passSlipMinutes?: number;
}): number {
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

  // Legacy: seconds field accidentally stored as whole minutes.
  if (secondsRaw === minutes && secondsRaw <= 120) {
    return minutes * 60;
  }

  return secondsRaw;
}
