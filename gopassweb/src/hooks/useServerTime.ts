import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { API_URL } from '../config/api';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

type ServerTimeContextValue = {
  getServerNow: () => Date;
  isSynced: boolean;
  resync: () => Promise<void>;
};

const ServerTimeContext = createContext<ServerTimeContextValue | null>(null);

export function ServerTimeProvider({ children }: { children: ReactNode }) {
  const offsetRef = useRef(0);
  const [isSynced, setIsSynced] = useState(false);

  const sync = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const response = await fetch(`${API_URL}/time`);
      if (!response.ok) return;
      const data = await response.json();
      const receivedAt = Date.now();
      const rtt = receivedAt - sentAt;
      const serverTime = Number(data.serverTime);
      if (!Number.isFinite(serverTime)) return;
      offsetRef.current = serverTime + rtt / 2 - receivedAt;
      setIsSynced(true);
    } catch {
      // Keep last known offset; timers still run on device clock until sync succeeds.
    }
  }, []);

  const getServerNow = useCallback(() => new Date(Date.now() + offsetRef.current), []);

  useEffect(() => {
    void sync();
    const interval = setInterval(() => {
      void sync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sync]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') void sync();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') void sync();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [sync]);

  const value = useMemo(
    () => ({ getServerNow, isSynced, resync: sync }),
    [getServerNow, isSynced, sync],
  );

  return React.createElement(ServerTimeContext.Provider, { value }, children);
}

export function useServerTime(): ServerTimeContextValue {
  const ctx = useContext(ServerTimeContext);
  if (!ctx) {
    return {
      getServerNow: () => new Date(),
      isSynced: false,
      resync: async () => {},
    };
  }
  return ctx;
}
