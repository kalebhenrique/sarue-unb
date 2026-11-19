import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '@/lib/storage-keys';

const listeners = new Set<() => void>();

export function isRuHiddenInDesktopSidebar(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEYS.HIDE_RU_DESKTOP_SIDEBAR) === 'true';
  } catch {
    return false;
  }
}

export function setRuHiddenInDesktopSidebar(hidden: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEYS.HIDE_RU_DESKTOP_SIDEBAR, String(hidden));
    } catch {}
  }
  listeners.forEach((fn) => fn());
}

export function useDesktopRuSidebar() {
  const [isHidden, setIsHidden] = useState<boolean>(isRuHiddenInDesktopSidebar);

  useEffect(() => {
    const sync = () => setIsHidden(isRuHiddenInDesktopSidebar());
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const setHidden = useCallback((next: boolean) => {
    setIsHidden(next);
    setRuHiddenInDesktopSidebar(next);
  }, []);

  return {
    isHidden,
    setHidden,
  };
}
