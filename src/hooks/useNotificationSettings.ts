import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui';
import {
  getNotificationSettings,
  loadNotificationSettings,
  normalizeNotificationSettings,
  saveNotificationSettings,
  subscribeToNotificationSettings,
  syncRuMenuNotifications,
  type NotificationSettings,
  type RuMealType,
  type Weekday,
} from '@/core';
import { useContainer } from '../context/ContainerContext';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useNotificationSettings() {
  const { repos } = useContainer();
  const [settings, setSettings] = useState<NotificationSettings>(() =>
    getNotificationSettings(),
  );
  // Mantém a última seleção síncrona para compor cliques rápidos sem flash na UI.
  const settingsRef = useRef<NotificationSettings>(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let active = true;
    void loadNotificationSettings().then((loaded) => {
      if (active) {
        settingsRef.current = loaded;
        setSettings(loaded);
      }
    });
    const unsubscribe = subscribeToNotificationSettings((next) => {
      if (active) {
        settingsRef.current = next;
        setSettings(next);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const ensurePermissionOnEnable = useCallback(async () => {
    if (!isTauriRuntime()) return;
    const granted = await repos.osNotifier.ensurePermission();
    if (!granted) {
      toast.add({
        title: 'Permissão de notificação desativada',
        description:
          'Ative as notificações do Saruê nas configurações do seu sistema para receber alertas.',
        type: 'warning',
        timeout: 5000,
      });
    }
  }, [repos.osNotifier]);

  const applyUpdate = useCallback(
    async (
      nextRaw: NotificationSettings,
      ruOptions?: { resyncRu: boolean; fetchIfMissing?: boolean },
    ) => {
      const next = normalizeNotificationSettings(nextRaw);
      settingsRef.current = next;
      setSettings(next);

      await saveNotificationSettings(next);
      if (ruOptions?.resyncRu) {
        await syncRuMenuNotifications({
          fetchIfMissing: ruOptions.fetchIfMissing,
        });
      }
    },
    [],
  );

  const toggleDeadlines = useCallback(
    async (enabled: boolean) => {
      const current = settingsRef.current;
      const next: NotificationSettings = {
        ...current,
        deadlines: enabled,
      };
      if (enabled) {
        void ensurePermissionOnEnable();
      }
      await applyUpdate(next);
    },
    [applyUpdate, ensurePermissionOnEnable],
  );

  const toggleBackgroundSync = useCallback(
    async (enabled: boolean) => {
      const current = settingsRef.current;
      const next: NotificationSettings = {
        ...current,
        backgroundSync: enabled,
      };
      if (enabled) {
        void ensurePermissionOnEnable();
      }
      await applyUpdate(next);
    },
    [applyUpdate, ensurePermissionOnEnable],
  );

  const toggleRuMenu = useCallback(
    async (enabled: boolean) => {
      const current = settingsRef.current;
      const next: NotificationSettings = {
        ...current,
        ruMenu: {
          ...current.ruMenu,
          enabled,
        },
      };
      if (enabled) {
        void ensurePermissionOnEnable();
      }
      await applyUpdate(next, {
        resyncRu: true,
        fetchIfMissing: enabled,
      });
    },
    [applyUpdate, ensurePermissionOnEnable],
  );

  const toggleRuWeekday = useCallback(
    async (day: Weekday) => {
      const current = settingsRef.current;
      const exists = current.ruMenu.weekdays.includes(day);
      const nextWeekdays = exists
        ? current.ruMenu.weekdays.filter((d) => d !== day)
        : [...current.ruMenu.weekdays, day];
      const next: NotificationSettings = {
        ...current,
        ruMenu: {
          ...current.ruMenu,
          weekdays: nextWeekdays,
        },
      };
      await applyUpdate(next, {
        resyncRu: current.ruMenu.enabled,
        fetchIfMissing: true,
      });
    },
    [applyUpdate],
  );

  const toggleRuMeal = useCallback(
    async (meal: RuMealType) => {
      const current = settingsRef.current;
      const next: NotificationSettings = {
        ...current,
        ruMenu: {
          ...current.ruMenu,
          meals: {
            ...current.ruMenu.meals,
            [meal]: !current.ruMenu.meals[meal],
          },
        },
      };
      await applyUpdate(next, {
        resyncRu: current.ruMenu.enabled,
        fetchIfMissing: true,
      });
    },
    [applyUpdate],
  );

  return {
    settings,
    toggleDeadlines,
    toggleBackgroundSync,
    toggleRuMenu,
    toggleRuWeekday,
    toggleRuMeal,
  };
}
