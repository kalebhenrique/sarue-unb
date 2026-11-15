import { useState, useEffect, useCallback } from 'react';
import {
  CAMPUS_STORAGE_KEY,
  getSavedRuCampus,
  getBrasiliaTodayIso,
  loadCachedRuMenus,
  fetchAndCacheRuMenus,
  subscribeToRuWalletUpdates,
  type RuCampus,
  type RawRuDailyMenu,
} from '@/core';

export function useRuMenu() {
  const [campus, setCampusState] = useState<RuCampus>(() => getSavedRuCampus());
  const [menus, setMenus] = useState<RawRuDailyMenu[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const setCampus = useCallback((next: RuCampus) => {
    setCampusState(next);
    try {
      window.localStorage.setItem(CAMPUS_STORAGE_KEY, next);
    } catch {}
  }, []);

  const loadForCampus = useCallback(async (targetCampus: RuCampus) => {
    const cached = await loadCachedRuMenus(targetCampus);
    const todayIso = getBrasiliaTodayIso();
    const hasCurrentOrFutureMenu = cached.menus.some((m) => m.date >= todayIso);

    if (cached.menus.length > 0) {
      setMenus(cached.menus);
      setLastUpdatedAt(cached.lastUpdatedAt);
      setIsLoading(false);
      setError(null);
      if (!hasCurrentOrFutureMenu) {
        try {
          const fresh = await fetchAndCacheRuMenus(targetCampus);
          setMenus(fresh.menus);
          setLastUpdatedAt(fresh.updatedAt);
        } catch {
          // Mantém o cache offline silenciosamente se estiver sem rede
        }
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const fresh = await fetchAndCacheRuMenus(targetCampus);
      setMenus(fresh.menus);
      setLastUpdatedAt(fresh.updatedAt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Cardápio indisponível offline. Sincronize quando estiver conectado.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadForCampus(campus);
    return subscribeToRuWalletUpdates(() => {
      void loadCachedRuMenus(campus).then((cached) => {
        if (cached.menus.length > 0) {
          setMenus(cached.menus);
          setLastUpdatedAt(cached.lastUpdatedAt);
          setError(null);
        }
      });
    });
  }, [campus, loadForCampus]);

  return {
    campus,
    setCampus,
    menus,
    lastUpdatedAt,
    isLoading,
    error,
  };
}
