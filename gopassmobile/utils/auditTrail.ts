export interface AuditTrailEvent {
  action: string;
  label: string;
  performedBy?: string | null;
  performedByName?: string | null;
  role?: string | null;
  timestamp: string;
  details?: string | null;
}

export function formatAuditDate(value: string | Date | undefined | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatAuditTime(value: string | Date | undefined | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function resolveCancelledTimestamp(
  cancelledAt?: string | null,
  auditLog?: AuditTrailEvent[] | null,
): string | null {
  if (cancelledAt) return cancelledAt;
  const events = auditLog || [];
  const cancelled = [...events]
    .filter((e) => e.action === 'cancelled' && e.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  return cancelled?.timestamp || null;
}
