import axios from 'axios';

export function getAxiosErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const msg = (err.response.data as { message?: string }).message;
    if (msg) return msg;
  }
  return fallback;
}

/** Repeat tap after the first recommend/approve already succeeded. */
export function isStaleApprovalRequestError(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 400) return false;
  const msg = getAxiosErrorMessage(err, '').toLowerCase();
  return msg.includes('only recommend pending');
}
