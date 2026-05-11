const rawBase =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || /*'http://192.168.0.247:5000' ||*/ 'http://192.168.254.146:5000';
export const API_BASE_URL = rawBase.replace(/\/$/, '');
export const API_URL = `${API_BASE_URL}/api`;
