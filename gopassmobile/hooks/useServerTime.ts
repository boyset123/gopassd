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
import { AppState, type AppStateStatus } from 'react-native';
import axios from 'axios';
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
      const response = await axios.get(`${API_URL}/time`);
      const receivedAt = Date.now();
      const rtt = receivedAt - sentAt;
      const serverTime = Number(response.data?.serverTime);
      if (!Number.isFinite(serverTime)) return;
      offsetRef.current = serverTime + rtt / 2 - receivedAt;
      setIsSynced(true);
    } catch {
      // Keep last known offset until sync succeeds.
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
