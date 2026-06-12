import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../config/api';

const DASHBOARD_PRIORITY: Array<{ role: string; route: string }> = [
  { role: 'President', route: '/(tabs)/presidentDashboard' },
  { role: 'Vice President', route: '/(tabs)/presidentDashboard' },
  { role: 'Faculty Dean', route: '/(tabs)/facultyDeanDashboard' },
  { role: 'Program Head', route: '/(tabs)/programHeadDashboard' },
  { role: 'Security Personnel', route: '/(tabs)/securityDashboard' },
];

export function pickDashboardRoute(
  role: string | undefined | null,
  activeOicForRoles: string[] = [],
): string {
  const all = new Set<string>([role || '', ...activeOicForRoles].filter(Boolean) as string[]);
  for (const entry of DASHBOARD_PRIORITY) {
    if (all.has(entry.role)) return entry.route;
  }
  return '/(tabs)/slips';
}

export type RestoreSessionResult = {
  restored: boolean;
  route?: string;
};

export async function restoreSession(): Promise<RestoreSessionResult> {
  const token = await AsyncStorage.getItem('userToken');
  if (!token) {
    return { restored: false };
  }

  try {
    const response = await axios.get(`${API_URL}/users/me`, {
      headers: { 'x-auth-token': token },
    });
    const user = response.data;
    if (!user) {
      return { restored: false };
    }

    const activeOicForRoles: string[] = Array.isArray(user.activeOicForRoles)
      ? user.activeOicForRoles
      : [];
    await AsyncStorage.setItem('userData', JSON.stringify(user));

    return {
      restored: true,
      route: pickDashboardRoute(user.role, activeOicForRoles),
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status) {
      const status = err.response.status;
      if (status === 401 || status === 403) {
        await AsyncStorage.multiRemove(['userToken', 'userData']);
      }
    }
    return { restored: false };
  }
}
