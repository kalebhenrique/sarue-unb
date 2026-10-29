import { useSyncExternalStore, useEffect } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'ready-to-restart'
  | 'error';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

interface UpdaterStore {
  status: UpdaterStatus;
  updateInfo: UpdateInfo | null;
  progress: DownloadProgress | null;
  errorMessage: string | null;
  currentVersion: string;
}

let store: UpdaterStore = {
  status: 'idle',
  updateInfo: null,
  progress: null,
  errorMessage: null,
  currentVersion: '0.3.1',
};

let pendingUpdate: Update | null = null;
const listeners = new Set<() => void>();

function setStore(patch: Partial<UpdaterStore>) {
  store = { ...store, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UpdaterStore {
  return store;
}

let versionLoading = false;
let versionLoaded = false;

export async function loadAppVersion(): Promise<string> {
  if (versionLoaded) return store.currentVersion;
  if (versionLoading) return store.currentVersion;

  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    versionLoading = true;
    try {
      const v = await getVersion();
      versionLoaded = true;
      setStore({ currentVersion: v });
      return v;
    } catch (err) {
      console.warn('Não foi possível ler a versão do app:', err);
    } finally {
      versionLoading = false;
    }
  }
  return store.currentVersion;
}

// Inicia leitura assíncrona da versão se ambiente Tauri detectado
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  void loadAppVersion();
}

/**
 * Consulta se há atualizações disponíveis no GitHub Releases via Tauri plugin-updater.
 * Se silent=true, executa em segundo plano sem alterar status de erro na interface.
 */
export async function checkForUpdates(silent = false): Promise<Update | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return null;
  }

  // Não interrompe download em andamento ou app pronto para reiniciar
  if (store.status === 'downloading' || store.status === 'ready-to-restart') {
    return pendingUpdate;
  }

  if (!silent) {
    setStore({ status: 'checking', errorMessage: null });
  }

  try {
    const update = await check();
    if (update?.available) {
      pendingUpdate = update;
      setStore({
        status: 'available',
        updateInfo: {
          version: update.version,
          currentVersion: update.currentVersion,
          date: update.date,
          body: update.body,
        },
        errorMessage: null,
      });
      return update;
    } else {
      pendingUpdate = null;
      setStore({
        status: silent
          ? store.status === 'available'
            ? 'idle'
            : store.status
          : 'up-to-date',
        updateInfo: null,
        errorMessage: null,
      });
      return null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!silent) {
      console.error('Falha ao verificar atualizações:', err);
      setStore({ status: 'error', errorMessage: msg });
    } else {
      console.warn('[Updater] Verificação silenciosa em segundo plano falhou:', err);
    }
    return null;
  }
}

/**
 * Baixa e aplica a atualização encontrada.
 */
export async function downloadAndInstall(): Promise<void> {
  const update = pendingUpdate;
  if (!update) {
    setStore({
      status: 'error',
      errorMessage: 'Nenhuma atualização pronta para download.',
    });
    return;
  }

  try {
    setStore({
      status: 'downloading',
      errorMessage: null,
      progress: { downloaded: 0, total: 0, percent: 0 },
    });

    let downloadedBytes = 0;
    let totalBytes = 0;
    let lastPercent = -1;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          totalBytes = event.data.contentLength ?? 0;
          lastPercent = -1;
          setStore({
            progress: { downloaded: 0, total: totalBytes, percent: 0 },
          });
          break;
        case 'Progress': {
          downloadedBytes += event.data.chunkLength;
          const pct =
            totalBytes > 0
              ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
              : 0;
          if (pct !== lastPercent) {
            lastPercent = pct;
            setStore({
              progress: {
                downloaded: downloadedBytes,
                total: totalBytes,
                percent: pct,
              },
            });
          }
          break;
        }
        case 'Finished':
          setStore({
            progress: { downloaded: totalBytes, total: totalBytes, percent: 100 },
          });
          break;
      }
    });

    setStore({ status: 'ready-to-restart' });
  } catch (err) {
    console.error('Falha no download da atualização:', err);
    const msg = err instanceof Error ? err.message : String(err);
    setStore({ status: 'error', errorMessage: msg });
  }
}

/**
 * Reinicia o aplicativo para concluir a instalação da nova versão.
 */
export async function relaunchApp(): Promise<void> {
  try {
    await relaunch();
  } catch (err) {
    console.error('Falha ao reiniciar o aplicativo:', err);
    const msg = err instanceof Error ? err.message : String(err);
    setStore({ status: 'error', errorMessage: msg });
  }
}

/**
 * Hook reativo que retorna boolean indicando se há atualização pronta para o app.
 * Só aciona re-render quando a disponibilidade de fato mudar (evita ticks de download).
 */
export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    subscribe,
    () =>
      store.status === 'available' ||
      store.status === 'downloading' ||
      store.status === 'ready-to-restart' ||
      Boolean(store.updateInfo),
  );
}

/**
 * Hook principal do atualizador do app com estado compartilhado entre os cards e a sidebar.
 */
export function useAppUpdater() {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    void loadAppVersion();
  }, []);

  const hasUpdateAvailable =
    state.status === 'available' ||
    state.status === 'downloading' ||
    state.status === 'ready-to-restart' ||
    Boolean(state.updateInfo);

  return {
    ...state,
    hasUpdateAvailable,
    checkForUpdates,
    downloadAndInstall,
    relaunchApp,
  };
}

/**
 * Utilitário interno para testes unitários resetarem ou injetarem estado do updater.
 */
export function __setUpdaterStoreForTesting(
  patch: Partial<UpdaterStore>,
  mockPendingUpdate?: Update | null,
) {
  if (mockPendingUpdate !== undefined) {
    pendingUpdate = mockPendingUpdate;
  }
  setStore(patch);
}
