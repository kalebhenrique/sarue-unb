import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const setMaxBrightnessMock = vi.fn<
  (enable: boolean) => Promise<{ status: 'ok'; data: null } | { status: 'error'; error: string }>
>(async () => ({ status: 'ok', data: null }));

vi.mock('@/core/infrastructure/bindings', () => ({
  commands: {
    setMaxBrightness: setMaxBrightnessMock,
  },
}));

import {
  setMaxBrightness,
  setupMaxBrightnessLifecycle,
} from '../useMaxBrightness';

describe('useMaxBrightness lifecycle & bridge', () => {
  let docListeners: Record<string, Set<EventListener>> = {};
  let winListeners: Record<string, Set<EventListener>> = {};
  let visibilityState: DocumentVisibilityState = 'visible';

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    setMaxBrightnessMock.mockClear();
    docListeners = {};
    winListeners = {};
    visibilityState = 'visible';

    Object.defineProperty(globalThis, 'window', {
      value: {
        __TAURI_INTERNALS__: {},
        addEventListener: vi.fn((event: string, cb: EventListener) => {
          winListeners[event] ??= new Set();
          winListeners[event].add(cb);
        }),
        removeEventListener: vi.fn((event: string, cb: EventListener) => {
          winListeners[event]?.delete(cb);
        }),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'document', {
      value: {
        get visibilityState() {
          return visibilityState;
        },
        addEventListener: vi.fn((event: string, cb: EventListener) => {
          docListeners[event] ??= new Set();
          docListeners[event].add(cb);
        }),
        removeEventListener: vi.fn((event: string, cb: EventListener) => {
          docListeners[event]?.delete(cb);
        }),
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
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('chama commands.setMaxBrightness quando __TAURI_INTERNALS__ está presente', async () => {
    await setMaxBrightness(true);
    await setMaxBrightness(false);

    expect(setMaxBrightnessMock).toHaveBeenCalledTimes(2);
    expect(setMaxBrightnessMock).toHaveBeenNthCalledWith(1, true);
    expect(setMaxBrightnessMock).toHaveBeenNthCalledWith(2, false);
  });

  it('é no-op seguro fora do runtime Tauri (sem __TAURI_INTERNALS__)', async () => {
    delete (globalThis.window as unknown as Record<string, unknown>)
      .__TAURI_INTERNALS__;

    await setMaxBrightness(true);
    expect(setMaxBrightnessMock).not.toHaveBeenCalled();
  });

  it('ativa brilho máximo na montagem, restaura ao minimizar e reativa ao voltar', () => {
    const calls: boolean[] = [];
    const cleanup = setupMaxBrightnessLifecycle((enable) => calls.push(enable));

    expect(calls).toEqual([true]);

    // Usuário minimiza o app (visibilitychange -> hidden)
    visibilityState = 'hidden';
    docListeners.visibilitychange?.forEach((cb) => cb(new Event('visibilitychange')));
    expect(calls).toEqual([true, false]);

    // Usuário retorna para o app na mesma tela (visibilitychange -> visible)
    visibilityState = 'visible';
    docListeners.visibilitychange?.forEach((cb) => cb(new Event('visibilitychange')));
    expect(calls).toEqual([true, false, true]);

    // Ao desmontar ou fechar o modal, chama obrigatoriamente false e remove listeners
    cleanup();
    expect(calls).toEqual([true, false, true, false]);
    expect(docListeners.visibilitychange?.size).toBe(0);
    expect(winListeners.blur?.size).toBe(0);
    expect(winListeners.focus?.size).toBe(0);
  });

  it('restaura brilho no blur e reativa no focus apenas se visível', () => {
    const calls: boolean[] = [];
    const cleanup = setupMaxBrightnessLifecycle((enable) => calls.push(enable));

    expect(calls).toEqual([true]);

    winListeners.blur?.forEach((cb) => cb(new Event('blur')));
    expect(calls).toEqual([true, false]);

    // Focus enquanto ainda hidden não deve reativar
    visibilityState = 'hidden';
    winListeners.focus?.forEach((cb) => cb(new Event('focus')));
    expect(calls).toEqual([true, false]);

    // Focus quando visível reativa
    visibilityState = 'visible';
    winListeners.focus?.forEach((cb) => cb(new Event('focus')));
    expect(calls).toEqual([true, false, true]);

    cleanup();
    expect(calls).toEqual([true, false, true, false]);
  });
});
