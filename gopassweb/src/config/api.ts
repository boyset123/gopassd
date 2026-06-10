import axios from 'axios';

const rawBase = (
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  process.env.EXPO_PUBLIC_API_ORIGIN?.trim() ||
  'http://localhost:5000'
).replace(/\/$/, '');

export const API_BASE_URL = rawBase;
export const API_URL = `${API_BASE_URL}/api`;

/** Shared axios client with a 10s timeout so unreachable hosts fail fast. */
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
});
