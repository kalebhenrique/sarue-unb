import { useState, useEffect, useCallback } from 'react';
import { isMobileDevice } from '@/lib/platform';

const STORAGE_KEY = 'sarue_autostart_enabled';

export function useAutostart() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        if (isMobileDevice()) {
          if (isMounted) setIsEnabled(false);
        } else if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const { isEnabled: checkEnabled } = await import('@tauri-apps/plugin-autostart');
          const enabled = await checkEnabled();
          if (isMounted) setIsEnabled(enabled);
        } else {
          const stored = localStorage.getItem(STORAGE_KEY) === 'true';
          if (isMounted) setIsEnabled(stored);
        }
      } catch (e) {
        console.warn('Erro ao verificar autostart:', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const toggle = useCallback(async (nextValue: boolean) => {
    if (isMobileDevice()) return;
    setIsEnabled(nextValue);
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { enable, disable } = await import('@tauri-apps/plugin-autostart');
        if (nextValue) {
          await enable();
        } else {
          await disable();
        }
      } else {
        localStorage.setItem(STORAGE_KEY, String(nextValue));
      }
    } catch (e) {
      console.warn('Erro ao alterar autostart:', e);
      setIsEnabled(!nextValue);
    }
  }, []);

  return { isEnabled, isLoading, toggle };
}
