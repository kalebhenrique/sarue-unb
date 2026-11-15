import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
  type NotificationSettings,
} from '../domain/entities/notification-settings';
import { getDatabase } from './sqlite-feed.repo';

export const NOTIFICATION_SETTINGS_SQLITE_KEY = 'notification_settings';

const settingsListeners = new Set<(settings: NotificationSettings) => void>();

export function subscribeToNotificationSettings(
  listener: (settings: NotificationSettings) => void,
): () => void {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}

function notifySettingsListeners(settings: NotificationSettings): void {
  settingsListeners.forEach((fn) => fn(settings));
}

function cloneDefaultSettings(): NotificationSettings {
  return normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
}

/**
 * Lê de forma síncrona as preferências de notificação do `localStorage` para
 * hidratação imediata na UI e checagens rápidas em background.
 */
export function getNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') return cloneDefaultSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.NOTIFICATION_SETTINGS);
    if (!raw) return cloneDefaultSettings();
    return normalizeNotificationSettings(JSON.parse(raw));
  } catch {
    return cloneDefaultSettings();
  }
}

function writeSettingsToLocalStorage(settings: NotificationSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.NOTIFICATION_SETTINGS,
      JSON.stringify(settings),
    );
  } catch {}
}

/** Carrega as preferências do SQLite (`app_settings`) sincronizando com `localStorage`. */
export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const local = getNotificationSettings();
  try {
    const db = await getDatabase();
    if (!db) return local;
    const rows = await db.select<Array<{ value: string }>>(
      'SELECT value FROM app_settings WHERE key = $1 LIMIT 1;',
      [NOTIFICATION_SETTINGS_SQLITE_KEY],
    );
    if (rows && rows.length > 0 && rows[0].value) {
      const normalized = normalizeNotificationSettings(JSON.parse(rows[0].value));
      writeSettingsToLocalStorage(normalized);
      return normalized;
    }
  } catch (err) {
    console.warn('[notification-settings] Falha ao ler app_settings:', err);
  }
  return local;
}

/** Atualiza e persiste as preferências de notificação em memória local e SQLite. */
export async function saveNotificationSettings(
  next: NotificationSettings,
): Promise<NotificationSettings> {
  const normalized = normalizeNotificationSettings(next);
  writeSettingsToLocalStorage(normalized);
  notifySettingsListeners(normalized);

  try {
    const db = await getDatabase();
    if (db) {
      await db.execute(
        'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3);',
        [
          NOTIFICATION_SETTINGS_SQLITE_KEY,
          JSON.stringify(normalized),
          new Date().toISOString(),
        ],
      );
    }
  } catch (err) {
    console.warn(
      '[notification-settings] Falha ao persistir no SQLite:',
      err,
    );
  }

  return normalized;
}

/** Lê chaves de refeições do RU já notificadas no dispositivo (janela de 14 dias). */
export function loadNotifiedRuMealKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.RU_NOTIFIED_MEALS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== 'object') return new Set();

    const cutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const keys = new Set<string>();
    for (const [k, iso] of Object.entries(parsed)) {
      const ts = new Date(iso).getTime();
      if (!Number.isNaN(ts) && ts >= cutoffMs) {
        keys.add(k);
      }
    }
    return keys;
  } catch {
    return new Set();
  }
}

/** Marca uma refeição de campus/data como já notificada neste dispositivo. */
export function markRuMealNotified(dedupeKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.RU_NOTIFIED_MEALS);
    const parsed: Record<string, string> =
      raw && typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, string>)
        : {};
    const cutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const pruned: Record<string, string> = {};
    for (const [k, iso] of Object.entries(parsed)) {
      const ts = new Date(iso).getTime();
      if (!Number.isNaN(ts) && ts >= cutoffMs) {
        pruned[k] = iso;
      }
    }
    pruned[dedupeKey] = new Date().toISOString();
    window.localStorage.setItem(
      STORAGE_KEYS.RU_NOTIFIED_MEALS,
      JSON.stringify(pruned),
    );
  } catch {}
}
