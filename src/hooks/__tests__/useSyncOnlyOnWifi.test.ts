import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NetworkStatus } from '@/core';
import { STORAGE_KEYS } from '@/lib/storage-keys';

const setSyncOnlyOnWifiMock = vi.fn<
  (enabled: boolean) => Promise<{ status: 'ok'; data: null } | { status: 'error'; error: string }>
>(async () => ({ status: 'ok', data: null }));

const getNetworkStatusMock = vi.fn<
  () => Promise<{ status: 'ok'; data: NetworkStatus } | { status: 'error'; error: string }>
>(async () => ({ status: 'ok', data: { connectionType: 'wifi', isMetered: false } }));

const isAutoSyncAllowedMock = vi.fn<
  () => Promise<{ status: 'ok'; data: boolean } | { status: 'error'; error: string }>
>(async () => ({ status: 'ok', data: true }));

const dbExecuteMock = vi.fn(async () => ({ rowsAffected: 1 }));

vi.mock('@/core/infrastructure/bindings', () => ({
  commands: {
    setSyncOnlyOnWifi: setSyncOnlyOnWifiMock,
    getNetworkStatus: getNetworkStatusMock,
    isAutoSyncAllowed: isAutoSyncAllowedMock,
  },
}));

vi.mock('@/core/infrastructure/sqlite-feed.repo', () => ({
  getDatabase: async () => ({
    execute: dbExecuteMock,
  }),
}));

import {
  SYNC_ONLY_ON_WIFI_SETTING_KEY,
  checkIsAutoSyncAllowed,
  queryNetworkStatus,
} from '@/core';
import {
  getDefaultSyncOnlyOnWifi,
  readStoredSyncOnlyOnWifi,
  saveSyncOnlyOnWifiPreference,
} from '../useSyncOnlyOnWifi';

describe('useSyncOnlyOnWifi & network-sync-settings', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  let storageMap: Map<string, string>;

  beforeEach(() => {
    storageMap = new Map();
    setSyncOnlyOnWifiMock.mockClear();
    getNetworkStatusMock.mockClear();
    isAutoSyncAllowedMock.mockClear();
    dbExecuteMock.mockClear();

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => storageMap.set(k, v),
        removeItem: (k: string) => storageMap.delete(k),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        __TAURI_INTERNALS__: {},
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
        onLine: true,
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('usa true como padrão no mobile e false no desktop', () => {
    expect(getDefaultSyncOnlyOnWifi()).toBe(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', onLine: true },
      configurable: true,
      writable: true,
    });
    expect(getDefaultSyncOnlyOnWifi()).toBe(false);
  });

  it('lê valor salvo no localStorage quando presente', () => {
    expect(readStoredSyncOnlyOnWifi()).toBe(true);

    storageMap.set(STORAGE_KEYS.SYNC_ONLY_ON_WIFI, 'false');
    expect(readStoredSyncOnlyOnWifi()).toBe(false);

    storageMap.set(STORAGE_KEYS.SYNC_ONLY_ON_WIFI, 'true');
    expect(readStoredSyncOnlyOnWifi()).toBe(true);
  });

  it('persiste preferência no backend Tauri, SQLite app_settings e localStorage', async () => {
    await saveSyncOnlyOnWifiPreference(false);

    expect(storageMap.get(STORAGE_KEYS.SYNC_ONLY_ON_WIFI)).toBe('false');
    expect(setSyncOnlyOnWifiMock).toHaveBeenCalledWith(false);
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
    const [sql, params] = dbExecuteMock.mock.calls[0] as unknown as [string, string[]];
    expect(sql).toContain('INSERT OR REPLACE INTO app_settings');
    expect(params[0]).toBe(SYNC_ONLY_ON_WIFI_SETTING_KEY);
    expect(params[1]).toBe('false');
  });

  it('consulta status da rede via plugin Tauri quando disponível', async () => {
    getNetworkStatusMock.mockResolvedValueOnce({
      status: 'ok',
      data: { connectionType: 'wifi', isMetered: true },
    });

    const status = await queryNetworkStatus();
    expect(status).toEqual({ connectionType: 'wifi', isMetered: true });
    expect(getNetworkStatusMock).toHaveBeenCalledTimes(1);
  });

  it('retorna fallback offline/wifi fora do runtime Tauri', async () => {
    delete (globalThis.window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0', onLine: false },
      configurable: true,
      writable: true,
    });

    const status = await queryNetworkStatus();
    expect(status).toEqual({ connectionType: 'offline', isMetered: false });
    expect(getNetworkStatusMock).not.toHaveBeenCalled();
  });

  it('verifica permissão de auto-sync via backend Tauri', async () => {
    isAutoSyncAllowedMock.mockResolvedValueOnce({ status: 'ok', data: false });
    expect(await checkIsAutoSyncAllowed()).toBe(false);

    isAutoSyncAllowedMock.mockResolvedValueOnce({ status: 'ok', data: true });
    expect(await checkIsAutoSyncAllowed()).toBe(true);
  });
});
