import { useEffect } from 'react';

/**
 * Invoca o comando nativo `set_max_brightness` via Tauri IPC.
 * Em ambientes web/testes (sem `__TAURI_INTERNALS__`) ou builds desktop,
 * comporta-se como no-op seguro.
 */
export async function setMaxBrightness(enable: boolean): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return;
  }

  try {
    const { commands } = await import('@/core/infrastructure/bindings');
    const result = await commands.setMaxBrightness(enable);
    if (result.status === 'error') {
      console.warn(
        '[useMaxBrightness] Falha ao ajustar brilho da tela:',
        result.error
      );
    }
  } catch (err) {
    console.warn('[useMaxBrightness] Erro ao invocar setMaxBrightness:', err);
  }
}

/**
 * Registra o ciclo de vida de brilho máximo + prevenção de bloqueio de tela
 * (visibilidade, blur/focus e cleanup obrigatório) e retorna a função de limpeza.
 */
export function setupMaxBrightnessLifecycle(
  onToggle: (enable: boolean) => void = (enable) => {
    void setMaxBrightness(enable);
  }
): () => void {
  let isActive = true;
  let isMaxApplied = false;

  const applyBrightness = (enable: boolean) => {
    if (enable === isMaxApplied) return;
    isMaxApplied = enable;
    onToggle(enable);
  };

  const isPageVisible = () =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden';

  if (isPageVisible()) {
    applyBrightness(true);
  }

  const handleVisibilityChange = () => {
    if (!isActive) return;
    applyBrightness(isPageVisible());
  };

  const handleBlur = () => {
    if (!isActive) return;
    applyBrightness(false);
  };

  const handleFocus = () => {
    if (!isActive) return;
    if (isPageVisible()) {
      applyBrightness(true);
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
  }

  return () => {
    isActive = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    }
    isMaxApplied = false;
    onToggle(false);
  };
}

/**
 * Eleva o brilho da tela ao máximo e impede o bloqueio automático (Keep Screen On)
 * enquanto `enabled` for verdadeiro e o aplicativo estiver visível em primeiro plano.
 *
 * Restaura automaticamente o brilho e o timeout padrão ao fechar o modal,
 * desmontar o componente ou minimizar/desfocar o app, reativando ao retornar.
 */
export function useMaxBrightness(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    return setupMaxBrightnessLifecycle();
  }, [enabled]);
}
