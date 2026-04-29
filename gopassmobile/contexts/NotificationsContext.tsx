import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import axios from 'axios';
import { useSocket } from '../config/SocketContext';
import { API_URL } from '../config/api';
import { initializeNotificationSound, playNotificationSound } from '../services/notificationSound';
import type { Notification } from '../components/NotificationsModal';

function sameId(a: unknown, b: unknown): boolean {
  return String(a) === String(b);
}

/** Read message without relying on object spread (some payloads omit enumerable message). */
function pickMessage(n: { message?: unknown }): string {
  const m = n.message;
  if (typeof m === 'string') return m;
  if (m == null) return '';
  return String(m);
}

function pickCreatedAt(n: { createdAt?: unknown }): string {
  const c = n.createdAt;
  if (typeof c === 'string') return c;
  if (c instanceof Date) return c.toISOString();
  return String(c ?? '');
}

/** Ensures plain fields for items coming from the API/socket. */
function normalizeNotification(n: Notification): Notification {
  const raw = n as Notification & { _id?: unknown };
  return {
    _id: raw._id != null ? String(raw._id) : '',
    message: pickMessage(raw as { message?: unknown }),
    read: Boolean(raw.read),
    createdAt: pickCreatedAt(raw as { createdAt?: unknown }),
  };
}

/** Mark read while explicitly preserving message/createdAt (avoids blank row after API completes). */
function withReadTrue(n: Notification): Notification {
  return {
    _id: String(n._id),
    message: pickMessage(n),
    createdAt: pickCreatedAt(n),
    read: true,
  };
}

type PassSlipAlertState = {
  shortSent: boolean;
  overSent: boolean;
  shortScheduleId?: string;
  overScheduleId?: string;
};

type PassSlipAlertsMap = Record<string, PassSlipAlertState>;

type UserPassSlip = {
  _id: string;
  status?: string;
  departureTime?: string;
  estimatedTimeBack?: string;
};

const PASS_SLIP_ALERTS_STORAGE_KEY = 'passSlipAlertState:v1';

function parseTimeOnBaseDate(timeStr: string | undefined, baseDate: Date): Date | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function getPassSlipEndTime(slip: UserPassSlip): Date | null {
  if (!slip.departureTime || !slip.estimatedTimeBack) return null;
  const departureDate = new Date(slip.departureTime);
  if (Number.isNaN(departureDate.getTime())) return null;
  const endTime = parseTimeOnBaseDate(slip.estimatedTimeBack, departureDate);
  if (!endTime) return null;
  if (endTime.getTime() < departureDate.getTime()) {
    endTime.setDate(endTime.getDate() + 1);
  }
  return endTime;
}

type NotificationsContextValue = {
  notifications: Notification[];
  fetchNotifications: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  markAllRead: () => Promise<void>;
  /** Marks a single notification read (server + local state). Client-only ids update local state only. */
  markNotificationRead: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllNotifications: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const socket = useSocket();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const initialFetchDone = useRef(false);
  const previousNewestId = useRef<string | null>(null);
  const alertSyncRunningRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      // If we don't have currentUserId yet (e.g. just logged in), load from storage so socket listener can attach
      if (currentUserId == null) {
        try {
          const userDataString = await AsyncStorage.getItem('userData');
          if (userDataString) {
            const userData = JSON.parse(userDataString);
            if (userData?._id) setCurrentUserId(String(userData._id));
          }
        } catch (_) {}
      }
      const { data } = await axios.get<Notification[]>(`${API_URL}/users/me/notifications`, {
        headers: { 'x-auth-token': token },
      });
      const next = (Array.isArray(data) ? data : []).map((n) => normalizeNotification(n as Notification));
      const newestId = next[0]?._id ?? null;
      // Play sound when fetch returns a newer notification than we had (fallback if socket event didn't fire)
      if (initialFetchDone.current && newestId && newestId !== previousNewestId.current) {
        if (__DEV__) console.log('[Notifications] new notification from fetch, playing sound');
        playNotificationSound();
      }
      previousNewestId.current = newestId;
      initialFetchDone.current = true;
      setNotifications(next);
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  }, [currentUserId]);

  const addNotification = useCallback((notification: Notification) => {
    if (!notification || !notification._id) {
      if (__DEV__) console.warn('[Notifications] addNotification skipped (no notification or _id)');
      return;
    }
    setNotifications((prev) => {
      const normalized = normalizeNotification(notification);
      const exists = prev.some((n) => sameId(n._id, normalized._id));
      if (exists) return prev;
      return [normalized, ...prev];
    });
    previousNewestId.current = String(notification._id);
    if (__DEV__) console.log('[Notifications] playNotificationSound() called');
    playNotificationSound();
  }, []);

  const syncPassSlipAlerts = useCallback(async () => {
    if (alertSyncRunningRef.current) return;
    alertSyncRunningRef.current = true;
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const perms = await Notifications.getPermissionsAsync();
      if (perms.status !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }

      const { data } = await axios.get<UserPassSlip[]>(`${API_URL}/pass-slips/my-slips`, {
        headers: { 'x-auth-token': token },
      });

      const allSlips = Array.isArray(data) ? data : [];
      const activeVerified = allSlips.filter((s) => s.status === 'Verified');
      const now = Date.now();

      const rawState = await AsyncStorage.getItem(PASS_SLIP_ALERTS_STORAGE_KEY);
      const state: PassSlipAlertsMap = rawState ? JSON.parse(rawState) : {};
      const nextState: PassSlipAlertsMap = {};

      for (const slip of activeVerified) {
        if (!slip._id) continue;
        const slipId = String(slip._id);
        const prev = state[slipId] || { shortSent: false, overSent: false };
        const endTime = getPassSlipEndTime(slip);

        if (!endTime) {
          nextState[slipId] = prev;
          continue;
        }

        const shortAtMs = endTime.getTime() - 5 * 60 * 1000;
        const overAtMs = endTime.getTime();
        const next: PassSlipAlertState = { ...prev };

        if (!next.shortSent && now >= shortAtMs) {
          addNotification({
            _id: `time-short-${slipId}`,
            message: 'Your time is running short. Please head back and scan for arrival on time.',
            read: false,
            createdAt: new Date().toISOString(),
          });
          next.shortSent = true;
          if (next.shortScheduleId) {
            await Notifications.cancelScheduledNotificationAsync(next.shortScheduleId);
            delete next.shortScheduleId;
          }
        } else if (!next.shortSent && !next.shortScheduleId && shortAtMs > now) {
          next.shortScheduleId = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Pass Slip Reminder',
              body: 'Your pass slip is almost out of time. Please head back.',
              data: { type: 'pass-slip-time-short', slipId },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(shortAtMs) },
          });
        }

        if (!next.overSent && now >= overAtMs) {
          addNotification({
            _id: `time-over-${slipId}`,
            message: 'Warning: You are late. Please scan for arrival immediately.',
            read: false,
            createdAt: new Date().toISOString(),
          });
          next.overSent = true;
          if (next.overScheduleId) {
            await Notifications.cancelScheduledNotificationAsync(next.overScheduleId);
            delete next.overScheduleId;
          }
        } else if (!next.overSent && !next.overScheduleId && overAtMs > now) {
          next.overScheduleId = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Pass Slip Late Alert',
              body: 'Your pass slip time is over. Please return and scan immediately.',
              data: { type: 'pass-slip-time-over', slipId },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(overAtMs) },
          });
        }

        nextState[slipId] = next;
      }

      const activeIds = new Set(activeVerified.map((s) => String(s._id)));
      for (const [slipId, old] of Object.entries(state)) {
        if (activeIds.has(slipId)) continue;
        if (old.shortScheduleId) {
          await Notifications.cancelScheduledNotificationAsync(old.shortScheduleId);
        }
        if (old.overScheduleId) {
          await Notifications.cancelScheduledNotificationAsync(old.overScheduleId);
        }
      }

      await AsyncStorage.setItem(PASS_SLIP_ALERTS_STORAGE_KEY, JSON.stringify(nextState));
    } catch (e) {
      console.error('Failed to sync pass slip alerts', e);
    } finally {
      alertSyncRunningRef.current = false;
    }
  }, [addNotification]);

  const markAllRead = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      await axios.put(
        `${API_URL}/users/me/notifications/mark-read`,
        { notificationId: 'all' },
        { headers: { 'x-auth-token': token } }
      );
      setNotifications((prev) => prev.map((n) => withReadTrue(n)));
    } catch (e) {
      console.error('Failed to mark notifications read', e);
    }
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    const idStr = String(id);
    const isClientOnly = /^(time-short-|time-over-)/.test(idStr);
    if (isClientOnly) {
      setNotifications((prev) => {
        const n = prev.find((x) => sameId(x._id, idStr));
        if (!n || n.read) return prev;
        return prev.map((x) => (sameId(x._id, idStr) ? withReadTrue(x) : x));
      });
      return;
    }

    let revert: Notification | undefined;
    setNotifications((prev) => {
      const n = prev.find((x) => sameId(x._id, idStr));
      if (!n || n.read) return prev;
      revert = normalizeNotification(n);
      return prev.map((x) => (sameId(x._id, idStr) ? withReadTrue(x) : x));
    });

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        if (revert) {
          setNotifications((prev) => prev.map((x) => (sameId(x._id, idStr) ? revert! : x)));
        }
        return;
      }
      await axios.put(
        `${API_URL}/users/me/notifications/mark-read`,
        { notificationId: idStr },
        { headers: { 'x-auth-token': token } }
      );
      // Do not setState again on success: a second merge was blanking expanded rows; optimistic state matches server.
    } catch (e) {
      console.error('Failed to mark notification read', e);
      if (revert) {
        setNotifications((prev) => prev.map((x) => (sameId(x._id, idStr) ? revert! : x)));
      }
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    // Client-only ids (e.g. time-short-, time-over-) are not on server; just remove from state
    const isClientOnly = /^(time-short-|time-over-)/.test(id);
    if (isClientOnly) {
      setNotifications((prev) => prev.filter((n) => !sameId(n._id, id)));
      return;
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      await axios.delete(`${API_URL}/users/me/notifications/${id}`, {
        headers: { 'x-auth-token': token },
      });
      setNotifications((prev) => prev.filter((n) => !sameId(n._id, id)));
    } catch (e) {
      console.error('Failed to delete notification', e);
      throw e;
    }
  }, []);

  const deleteAllNotifications = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      await axios.delete(`${API_URL}/users/me/notifications`, {
        headers: { 'x-auth-token': token },
      });
      setNotifications([]);
    } catch (e) {
      console.error('Failed to delete all notifications', e);
      throw e;
    }
  }, []);

  // Load current user id once (so socket listener can run without waiting for a screen)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const userDataString = await AsyncStorage.getItem('userData');
        if (cancelled || !userDataString) return;
        const userData = JSON.parse(userDataString);
        if (userData?._id) setCurrentUserId(String(userData._id));
      } catch (e) {
        console.error('Failed to load userData for notifications', e);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial fetch when user is logged in; single source of truth. Preload notification sound so it plays reliably.
  useEffect(() => {
    if (currentUserId == null) return;
    void initializeNotificationSound();
    fetchNotifications();
    syncPassSlipAlerts();
  }, [currentUserId, fetchNotifications, syncPassSlipAlerts]);

  // Single global socket listener: update list immediately and play sound (no dependency on which tab is mounted)
  useEffect(() => {
    if (!socket || currentUserId == null) return;
    const handler = (payload: {
      userId?: string;
      recipient?: string | { _id?: string };
      notification?: Notification;
    }) => {
      if (__DEV__) console.log('[Notifications] newNotification event', { payload, currentUserId });
      const userId =
        payload.userId ??
        (payload.recipient != null &&
        (typeof payload.recipient === 'string' ? payload.recipient : payload.recipient._id));
      if (!userId || String(userId) !== String(currentUserId)) {
        if (__DEV__) console.log('[Notifications] skip (userId mismatch or missing)', { userId, currentUserId });
        return;
      }
      const notification = payload.notification;
      if (!notification) {
        if (__DEV__) console.warn('[Notifications] no notification in payload');
        return;
      }
      if (__DEV__) console.log('[Notifications] adding notification, playing sound');
      addNotification(notification);
    };
    socket.on('newNotification', handler);
    return () => {
      socket.off('newNotification', handler);
    };
  }, [socket, currentUserId, addNotification]);

  // Refetch when app comes to foreground so we never show stale/late notifications
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current === 'background' && nextState === 'active' && currentUserId) {
        fetchNotifications();
        syncPassSlipAlerts();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [currentUserId, fetchNotifications, syncPassSlipAlerts]);

  // Keep pass-slip deadline alerts updated app-wide, not only on the slips timer screen.
  useEffect(() => {
    if (currentUserId == null) return;
    const interval = setInterval(() => {
      syncPassSlipAlerts();
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, [currentUserId, syncPassSlipAlerts]);

  const value: NotificationsContextValue = {
    notifications,
    fetchNotifications,
    addNotification,
    markAllRead,
    markNotificationRead,
    deleteNotification,
    deleteAllNotifications,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}
