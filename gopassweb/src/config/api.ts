import axios from 'axios';

const rawBase =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'http://192.168.0.247:5000' || 'http://192.168.254.146:5000';
export const API_BASE_URL = rawBase.replace(/\/$/, '');
export const API_URL = `${API_BASE_URL}/api`;

/** Shared client — admin register waits for Gmail send like the original flow. */
export const apiClient = axios.create({
  timeout: 90000,
});

export function getNetworkErrorMessage(error: unknown, action: string): string | null {
  if (!axios.isAxiosError(error) || error.response) {
    return null;
  }
  if (error.code === 'ECONNABORTED') {
    return `The server is taking too long while ${action}. Please wait a moment and try again.`;
  }
  return `Cannot reach the server. Check your connection and try again.`;
}
