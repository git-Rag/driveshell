/**
 * useSetupStatus — React hook that polls /api/setup/status.
 *
 * Returns the current setup status and a manual refresh function.
 * Polls every 3 seconds while the window is focused (stops when blurred).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSetupStatus, type SetupStatus } from '../lib/api';

export type SetupStatusState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: SetupStatus };

const POLL_INTERVAL = 3000;

export function useSetupStatus(): { status: SetupStatusState; refresh: () => void } {
  const [status, setStatus] = useState<SetupStatusState>({ state: 'loading' });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const data = await getSetupStatus();
      setStatus({ state: 'ready', data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setStatus({ state: 'error', message });
    }
  }, []);

  const startPolling = useCallback(() => {
    void fetch_();
    intervalRef.current = setInterval(() => void fetch_(), POLL_INTERVAL);
  }, [fetch_]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startPolling();
    const onFocus = () => startPolling();
    const onBlur = () => stopPolling();
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      stopPolling();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [startPolling, stopPolling]);

  return { status, refresh: () => void fetch_() };
}
