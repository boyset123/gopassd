/**
 * Format a pass-slip balance in seconds (e.g. 45 -> "45s", 90 -> "1m 30s", 3661 -> "1h 1m 1s").
 */
function formatPassSlipBalance(totalSecondsInput) {
  const total = Math.max(0, Math.floor(Number(totalSecondsInput) || 0));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours === 0) return `${mins}m ${secs}s`;
  return `${hours}h ${mins}m ${secs}s`;
}

module.exports = { formatPassSlipBalance };
