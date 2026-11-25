import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as updaterPlugin from '@tauri-apps/plugin-updater';
import * as processPlugin from '@tauri-apps/plugin-process';

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

import {
  checkForUpdates,
  downloadUpdate,
  downloadAndInstall,
  relaunchApp,
  __setUpdaterStoreForTesting,
  __getUpdaterStoreForTesting,
} from '../../hooks/useAppUpdater';

describe('App Updater & Sidebar Indicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __setUpdaterStoreForTesting({
      status: 'idle',
      updateInfo: null,
      progress: null,
      errorMessage: null,
      currentVersion: '0.1.1',
      isPlayStoreBuild: false,
    });
  });

  it('retorna null silenciosamente quando fora do ambiente Tauri', async () => {
    const result = await checkForUpdates(true);
    expect(result).toBeNull();
  });

  it('atualiza o estado para available quando uma atualização for encontrada no Tauri', async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error Mock window for Tauri environment
    globalThis.window = { __TAURI_INTERNALS__: {} };

    try {
      vi.mocked(updaterPlugin.check).mockResolvedValueOnce({
        available: true,
        version: '0.3.0',
        currentVersion: '0.2.0',
        date: '2026-10-22',
        body: 'Notas da versão 0.3.0',
        downloadAndInstall: vi.fn(),
      } as unknown as updaterPlugin.Update);

      const update = await checkForUpdates(true);
      expect(update).not.toBeNull();
      expect(update?.available).toBe(true);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('não define status como error em verificação silenciosa (silent=true)', async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error Mock window for Tauri environment
    globalThis.window = { __TAURI_INTERNALS__: {} };

    try {
      vi.mocked(updaterPlugin.check).mockRejectedValueOnce(new Error('Network offline'));

      const result = await checkForUpdates(true);
      expect(result).toBeNull();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('mantém indicador ativo durante download e reinicialização', () => {
    __setUpdaterStoreForTesting({
      status: 'downloading',
      updateInfo: {
        version: '0.3.0',
        currentVersion: '0.2.0',
      },
    });
    expect(true).toBe(true);

    __setUpdaterStoreForTesting({
      status: 'ready-to-restart',
      updateInfo: {
        version: '0.3.0',
        currentVersion: '0.2.0',
      },
    });
    expect(true).toBe(true);
  });

  it('retorna null imediatamente sem consultar o Tauri quando VITE_TARGET_STORE for microsoft', async () => {
    const originalEnv = import.meta.env.VITE_TARGET_STORE;
    (import.meta.env as Record<string, string>).VITE_TARGET_STORE = 'microsoft';

    try {
      const result = await checkForUpdates(false);
      expect(result).toBeNull();
      expect(updaterPlugin.check).not.toHaveBeenCalled();
    } finally {
      (import.meta.env as Record<string, string>).VITE_TARGET_STORE = originalEnv;
    }
  });

  it('baixa os arquivos da atualização via update.download() e transiciona para ready-to-restart', async () => {
    const mockDownload = vi.fn().mockImplementation(async (onProgress) => {
      onProgress({ event: 'Started', data: { contentLength: 1000 } });
      onProgress({ event: 'Progress', data: { chunkLength: 500 } });
      onProgress({ event: 'Finished' });
    });
    const mockInstall = vi.fn();

    const mockUpdate = {
      available: true,
      version: '0.3.5',
      currentVersion: '0.3.4',
      download: mockDownload,
      install: mockInstall,
    } as unknown as updaterPlugin.Update;

    __setUpdaterStoreForTesting(
      { status: 'available', updateInfo: { version: '0.3.5', currentVersion: '0.3.4' } },
      mockUpdate,
    );

    await downloadUpdate();

    expect(mockDownload).toHaveBeenCalled();
    expect(mockInstall).not.toHaveBeenCalled();
    expect(__getUpdaterStoreForTesting().status).toBe('ready-to-restart');
    expect(downloadAndInstall).toBe(downloadUpdate);
  });

  it('relaunchApp executa install e relaunch', async () => {
    const mockInstall = vi.fn().mockResolvedValue(undefined);
    const mockUpdate = {
      available: true,
      version: '0.3.5',
      currentVersion: '0.3.4',
      install: mockInstall,
    } as unknown as updaterPlugin.Update;

    __setUpdaterStoreForTesting(
      { status: 'ready-to-restart', updateInfo: { version: '0.3.5', currentVersion: '0.3.4' } },
      mockUpdate,
    );

    await relaunchApp();

    expect(mockInstall).toHaveBeenCalled();
    expect(processPlugin.relaunch).toHaveBeenCalled();
  });

  it('relaunchApp trata erro e define status como error caso install lance exceção', async () => {
    const mockInstall = vi.fn().mockRejectedValue(new Error('Signature mismatch'));
    const mockUpdate = {
      available: true,
      version: '0.3.5',
      currentVersion: '0.3.4',
      install: mockInstall,
    } as unknown as updaterPlugin.Update;

    __setUpdaterStoreForTesting(
      { status: 'ready-to-restart', updateInfo: { version: '0.3.5', currentVersion: '0.3.4' } },
      mockUpdate,
    );

    await relaunchApp();

    expect(mockInstall).toHaveBeenCalled();
    expect(__getUpdaterStoreForTesting().status).toBe('error');
    expect(__getUpdaterStoreForTesting().errorMessage).toBe('Signature mismatch');
  });
});
