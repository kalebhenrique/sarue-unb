import { useState, useEffect, useCallback } from 'react';
import {
  getSyncOnlyOnWifiSetting,
  persistSyncOnlyOnWifiToSqlite,
  queryNetworkStatus,
  setSyncOnlyOnWifiSetting,
  type NetworkStatus,
} from '@/core';
import { isMobileDevice } from '@/lib/platform';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export function getDefaultSyncOnlyOnWifi(): boolean {
  return isMobileDevice();
}

export function readStoredSyncOnlyOnWifi(): boolean {
  if (typeof window === 'undefined') return getDefaultSyncOnlyOnWifi();
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SYNC_ONLY_ON_WIFI);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {}
  return getDefaultSyncOnlyOnWifi();
}

export async function saveSyncOnlyOnWifiPreference(nextValue: boolean): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.SYNC_ONLY_ON_WIFI, String(nextValue));
  }
  await setSyncOnlyOnWifiSetting(nextValue);
}

export function useSyncOnlyOnWifi() {
  const [isEnabled, setIsEnabled] = useState<boolean>(readStoredSyncOnlyOnWifi);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);

  const refreshNetworkStatus = useCallback(async () => {
    const status = await queryNetworkStatus();
    if (status) {
      setNetworkStatus(status);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [prefValue, status] = await Promise.all([
          getSyncOnlyOnWifiSetting(),
          queryNetworkStatus(),
        ]);

        if (prefValue !== null && isMounted) {
          setIsEnabled(prefValue);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEYS.SYNC_ONLY_ON_WIFI, String(prefValue));
          }
          void persistSyncOnlyOnWifiToSqlite(prefValue, true);
        }

        if (status && isMounted) {
          setNetworkStatus(status);
        }
      } catch (err) {
        console.warn('Erro ao carregar preferência sync_only_on_wifi:', err);
      }
    })();

    const handleRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refreshNetworkStatus();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleRefresh);
      window.addEventListener('offline', handleRefresh);
      window.addEventListener('focus', handleRefresh);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleRefresh);
    }

    return () => {
      isMounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleRefresh);
        window.removeEventListener('offline', handleRefresh);
        window.removeEventListener('focus', handleRefresh);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleRefresh);
      }
    };
  }, [refreshNetworkStatus]);

  const toggle = useCallback(async (nextValue: boolean) => {
    setIsEnabled(nextValue);
    setIsLoading(true);
    try {
      await saveSyncOnlyOnWifiPreference(nextValue);
    } catch (err) {
      console.warn('Erro ao atualizar sync_only_on_wifi:', err);
      setIsEnabled(!nextValue);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.SYNC_ONLY_ON_WIFI, String(!nextValue));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isEnabled,
    isLoading,
    toggle,
    networkStatus,
    refreshNetworkStatus,
  };
}
