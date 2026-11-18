import { isMobileDevice } from '@/lib/platform';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  getBrasiliaTodayIso,
  type RawRuDailyMenu,
  type RuCampus,
} from '../domain/utils/ru-menu-formatter';
import {
  RU_NOTIFICATION_ID_MAX,
  RU_NOTIFICATION_ID_MIN,
  findDueRuMealsForTimestamp,
  planMobileRuSchedules,
} from '../domain/utils/ru-menu-notification';
import {
  getNotificationSettings,
  loadNotifiedRuMealKeys,
  markRuMealNotified,
} from './notification-settings.service';
import {
  fetchAndCacheRuMenus,
  getSavedRuCampus,
  loadCachedRuMenus,
} from './ru-wallet.service';
import { isOnboardingNotificationsBlocked } from './tauri-os-notifier';

const RU_NOTIFICATION_CHANNEL_ID = 'ru-menu';

let channelInitialized = false;
let syncInProgress = false;
let pendingResyncOptions: SyncRuNotificationOptions | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function readStoredScheduledIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.RU_SCHEDULED_NOTIF_IDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === 'number')
      : [];
  } catch {
    return [];
  }
}

function writeStoredScheduledIds(ids: number[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (ids.length === 0) {
      window.localStorage.removeItem(STORAGE_KEYS.RU_SCHEDULED_NOTIF_IDS);
    } else {
      window.localStorage.setItem(
        STORAGE_KEYS.RU_SCHEDULED_NOTIF_IDS,
        JSON.stringify(ids),
      );
    }
  } catch {}
}

async function ensureRuChannel(): Promise<void> {
  if (channelInitialized || !isTauriRuntime() || !isMobileDevice()) return;
  try {
    const { createChannel, Importance, Visibility } = await import(
      '@tauri-apps/plugin-notification'
    );
    await createChannel({
      id: RU_NOTIFICATION_CHANNEL_ID,
      name: 'Cardápio do RU',
      description: 'Avisos com as refeições do Restaurante Universitário da UnB',
      importance: Importance.Default,
      visibility: Visibility.Public,
      vibration: true,
    });
    channelInitialized = true;
  } catch {
    // Canal pode não ser suportado no iOS/desktop — ignora com segurança.
  }
}

async function cancelPendingMobileRuNotifications(): Promise<void> {
  if (!isTauriRuntime() || !isMobileDevice()) {
    writeStoredScheduledIds([]);
    return;
  }

  try {
    const { cancel, pending } = await import('@tauri-apps/plugin-notification');
    const idsToCancel = new Set<number>(readStoredScheduledIds());
    try {
      const pendingList = await pending();
      for (const item of pendingList) {
        if (
          item.id >= RU_NOTIFICATION_ID_MIN &&
          item.id <= RU_NOTIFICATION_ID_MAX
        ) {
          idsToCancel.add(item.id);
        }
      }
    } catch {}

    if (idsToCancel.size > 0) {
      await cancel(Array.from(idsToCancel));
    }
  } catch (err) {
    console.warn(
      '[ru-notification] Falha ao cancelar notificações pendentes do RU:',
      err,
    );
  } finally {
    writeStoredScheduledIds([]);
  }
}

async function notifyDueRuMealsNow(
  menus: readonly RawRuDailyMenu[],
  campus: RuCampus,
): Promise<void> {
  if (!isTauriRuntime() || isOnboardingNotificationsBlocked()) return;
  const settings = getNotificationSettings().ruMenu;
  if (!settings.enabled || settings.weekdays.length === 0) return;

  const due = findDueRuMealsForTimestamp(
    menus,
    settings,
    campus,
    loadNotifiedRuMealKeys(),
  );
  if (due.length === 0) return;

  try {
    const { isPermissionGranted, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    if (!(await isPermissionGranted())) return;

    await ensureRuChannel();
    const isMobile = isMobileDevice();

    for (const item of due) {
      markRuMealNotified(item.dedupeKey);
      sendNotification({
        title: item.payload.title,
        body: item.payload.body,
        ...(isMobile
          ? {
              channelId: RU_NOTIFICATION_CHANNEL_ID,
              largeBody: item.payload.largeBody,
              autoCancel: true,
            }
          : {}),
      });
    }
  } catch (err) {
    console.warn('[ru-notification] Falha ao enviar notificação do RU:', err);
  }
}

export interface SyncRuNotificationOptions {
  campus?: RuCampus;
  fetchIfMissing?: boolean;
  requestPermission?: boolean;
}

/**
 * Sincroniza as notificações do cardápio do RU:
 * - Em mobile (Android/iOS), cancela agendamentos anteriores do RU e agenda via
 *   `Schedule.at(...)` todos os cardápios futuros em cache para os dias e
 *   refeições escolhidos pelo usuário.
 * - Também avalia se alguma refeição de hoje já entrou na janela de aviso.
 */
export async function syncRuMenuNotifications(
  options: SyncRuNotificationOptions = {},
): Promise<void> {
  if (isOnboardingNotificationsBlocked()) return;
  if (syncInProgress) {
    pendingResyncOptions = {
      campus: options.campus ?? pendingResyncOptions?.campus,
      fetchIfMissing:
        options.fetchIfMissing || pendingResyncOptions?.fetchIfMissing,
      requestPermission:
        options.requestPermission || pendingResyncOptions?.requestPermission,
    };
    return;
  }
  syncInProgress = true;

  try {
    let currentOptions: SyncRuNotificationOptions | null = options;

    while (currentOptions) {
      const opts = currentOptions;
      currentOptions = null;

      try {
        const settings = getNotificationSettings().ruMenu;
        const campus = opts.campus ?? getSavedRuCampus();

        await cancelPendingMobileRuNotifications();

        if (!settings.enabled || settings.weekdays.length === 0) {
          continue;
        }

        if (!isTauriRuntime()) continue;

        const {
          isPermissionGranted,
          requestPermission,
          Schedule,
          sendNotification,
        } = await import('@tauri-apps/plugin-notification');

        let granted = await isPermissionGranted();
        if (!granted && opts.requestPermission) {
          granted = (await requestPermission()) === 'granted';
        }
        if (!granted) continue;

        let { menus } = await loadCachedRuMenus(campus);
        const todayIso = getBrasiliaTodayIso();
        const hasCurrentOrFuture = menus.some((m) => m.date >= todayIso);

        if (
          (menus.length === 0 || !hasCurrentOrFuture) &&
          opts.fetchIfMissing
        ) {
          try {
            const fresh = await fetchAndCacheRuMenus(campus);
            menus = fresh.menus;
          } catch {
            // Offline — prossegue com o que houver em cache.
          }
        }

        if (menus.length === 0) continue;

        // Dispara aviso da refeição atual se estivermos dentro da janela do dia
        await notifyDueRuMealsNow(menus, campus);

        // Em mobile, agenda no sistema operacional todas as futuras refeições em cache
        if (isMobileDevice()) {
          await ensureRuChannel();
          const planned = planMobileRuSchedules(menus, settings, campus);
          const scheduledIds: number[] = [];

          for (const item of planned) {
            sendNotification({
              id: item.id,
              channelId: RU_NOTIFICATION_CHANNEL_ID,
              title: item.payload.title,
              body: item.payload.body,
              largeBody: item.payload.largeBody,
              autoCancel: true,
              schedule: Schedule.at(item.fireAt, false, true),
            });
            scheduledIds.push(item.id);
          }

          writeStoredScheduledIds(scheduledIds);
        }
      } catch (err) {
        console.warn(
          '[ru-notification] Erro ao sincronizar notificações do cardápio:',
          err,
        );
      }

      if (pendingResyncOptions) {
        currentOptions = pendingResyncOptions;
        pendingResyncOptions = null;
      }
    }
  } finally {
    pendingResyncOptions = null;
    syncInProgress = false;
  }
}

/** Verifica rapidamente o cache local do campus atual e notifica refeição devida. */
export async function checkDueRuMenuNotification(): Promise<void> {
  if (!isTauriRuntime() || isOnboardingNotificationsBlocked()) return;
  const settings = getNotificationSettings().ruMenu;
  if (!settings.enabled || settings.weekdays.length === 0) return;
  const campus = getSavedRuCampus();
  const { menus } = await loadCachedRuMenus(campus);
  if (menus.length === 0) return;
  await notifyDueRuMealsNow(menus, campus);
}
