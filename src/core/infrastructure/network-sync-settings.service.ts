import type { ConnectionType, NetworkStatus } from './bindings';
import { getDatabase } from './sqlite-feed.repo';

export type { ConnectionType, NetworkStatus };

export const SYNC_ONLY_ON_WIFI_SETTING_KEY = 'sync_only_on_wifi';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getSyncOnlyOnWifiSetting(): Promise<boolean | null> {
  if (!isTauriRuntime()) return null;
  const { commands } = await import('./bindings');
  const res = await commands.getSyncOnlyOnWifi();
  return res.status === 'ok' ? res.data : null;
}

export async function setSyncOnlyOnWifiSetting(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  const { commands } = await import('./bindings');
  const res = await commands.setSyncOnlyOnWifi(enabled);
  if (res.status === 'error') {
    throw new Error(res.error);
  }
  await persistSyncOnlyOnWifiToSqlite(enabled, false);
}

export async function persistSyncOnlyOnWifiToSqlite(
  value: boolean,
  onlyIfMissing = false,
): Promise<void> {
  try {
    const db = await getDatabase();
    if (!db) return;
    const now = new Date().toISOString();
    const sql = onlyIfMissing
      ? 'INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)'
      : 'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)';
    await db.execute(sql, [SYNC_ONLY_ON_WIFI_SETTING_KEY, String(value), now]);
  } catch (err) {
    console.warn('Erro ao persistir sync_only_on_wifi no SQLite:', err);
  }
}

export async function queryNetworkStatus(): Promise<NetworkStatus | null> {
  try {
    if (isTauriRuntime()) {
      const { commands } = await import('./bindings');
      const res = await commands.getNetworkStatus();
      return res.status === 'ok' ? res.data : null;
    }
    if (typeof navigator !== 'undefined') {
      return {
        connectionType: navigator.onLine ? 'wifi' : 'offline',
        isMetered: false,
      };
    }
  } catch (err) {
    console.warn('Erro ao consultar status de rede:', err);
  }
  return null;
}

export async function checkIsAutoSyncAllowed(): Promise<boolean> {
  if (!isTauriRuntime()) return true;
  try {
    const { commands } = await import('./bindings');
    const res = await commands.isAutoSyncAllowed();
    return res.status === 'ok' ? res.data : true;
  } catch (err) {
    console.warn('[SyncContext] Falha ao verificar status de rede para sync automático:', err);
    return true;
  }
}
