import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../config/api';

export type ServerEventPayload = {
  collection: string;
  operationType: string;
  documentId?: string | null;
  userId?: string;
  notificationMessage?: string;
};

type UseServerEventsOptions = {
  enabled?: boolean;
  currentUserId?: string | null;
  onDataChange?: (message?: string) => void;
  onNotification?: (payload: {
    userId?: string;
    notification?: { message?: string };
  }) => void;
};

const TOKEN_REFRESH_MS = 4 * 60 * 1000;

async function fetchSseToken(): Promise<string> {
  const authToken = await AsyncStorage.getItem('userToken');
  if (!authToken) {
    throw new Error('Not authenticated');
  }
  const { data } = await axios.post<{ token: string }>(
    `${API_URL}/events/token`,
    {},
    { headers: { 'x-auth-token': authToken } }
  );
  return data.token;
}

export function useServerEvents({
  enabled = true,
  currentUserId = null,
  onDataChange,
  onNotification,
}: UseServerEventsOptions) {
  const onDataChangeRef = useRef(onDataChange);
  const onNotificationRef = useRef(onNotification);
  const currentUserIdRef = useRef(currentUserId);

  onDataChangeRef.current = onDataChange;
  onNotificationRef.current = onNotification;
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof EventSource === 'undefined') {
      return;
    }

    let eventSource: EventSource | null = null;
    let tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const clearTimers = () => {
      if (tokenRefreshTimer) {
        clearTimeout(tokenRefreshTimer);
        tokenRefreshTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const closeEventSource = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const scheduleReconnect = (delayMs = 3000) => {
      if (disposed) return;
      clearTimers();
      closeEventSource();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delayMs);
    };

    const handleEvent = (raw: MessageEvent) => {
      try {
        const payload = JSON.parse(String(raw.data)) as ServerEventPayload;

        if (payload.collection === 'users' && payload.operationType === 'notification') {
          const uid = payload.userId ?? payload.documentId;
          if (
            currentUserIdRef.current &&
            uid &&
            String(uid) !== String(currentUserIdRef.current)
          ) {
            return;
          }
          onNotificationRef.current?.({
            userId: uid ?? undefined,
            notification: payload.notificationMessage
              ? { message: payload.notificationMessage }
              : { message: undefined },
          });
          onDataChangeRef.current?.('You have a new notification — your dashboard has been updated.');
          return;
        }

        if (payload.collection === 'passSlips' || payload.collection === 'travelOrders') {
          onDataChangeRef.current?.('New activity — your dashboard has been updated.');
        }
      } catch (err) {
        console.warn('Failed to parse SSE event:', err);
      }
    };

    const connect = async () => {
      if (disposed) return;
      try {
        const sseToken = await fetchSseToken();
        if (disposed) return;

        closeEventSource();
        const url = `${API_URL}/events/stream?token=${encodeURIComponent(sseToken)}`;
        eventSource = new EventSource(url);

        eventSource.onmessage = handleEvent;

        eventSource.onerror = () => {
          if (disposed) return;
          scheduleReconnect(3000);
        };

        tokenRefreshTimer = setTimeout(() => {
          if (!disposed) scheduleReconnect(500);
        }, TOKEN_REFRESH_MS);
      } catch (err) {
        console.warn('SSE connect failed:', err);
        scheduleReconnect(5000);
      }
    };

    void connect();

    return () => {
      disposed = true;
      clearTimers();
      closeEventSource();
    };
  }, [enabled, currentUserId]);
}
