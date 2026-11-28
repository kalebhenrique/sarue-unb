import { useState, useEffect, useCallback } from 'react';
import { useContainer } from '../context/ContainerContext';
import { humanizeError } from '@/lib/error-messages';
import type {
  AllPlatformCredentials,
  SigaaCredentials,
  Aprender3Credentials,
  TeamsCredentials,
  PlatformType,
} from '@/core';

// Cache e notificador global entre instâncias do hook useCredentials
let cachedAllCredentials: AllPlatformCredentials = {};
let cachedHasCredentials: boolean | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

let sharedLoadPromise: Promise<void> | null = null;

export function useCredentials() {
  const { useCases } = useContainer();
  const [allCredentials, setAllCredentials] = useState<AllPlatformCredentials>(cachedAllCredentials);
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(cachedHasCredentials);
  const [isLoading, setIsLoading] = useState<boolean>(cachedHasCredentials === null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (cachedHasCredentials === null) {
      setIsLoading(true);
    }
    try {
      if (!sharedLoadPromise) {
        sharedLoadPromise = (async () => {
          const creds = await useCases.getCredentials.getAllCredentials();
          const exists = Boolean(
            (creds.sigaa && creds.sigaa.matricula && creds.sigaa.senha) ||
              (creds.aprender3 && creds.aprender3.cpf && creds.aprender3.senha) ||
              (creds.teams && creds.teams.isConnected),
          );
          cachedHasCredentials = exists;
          cachedAllCredentials = creds;
        })();
      }
      await sharedLoadPromise;
      setHasCredentials(cachedHasCredentials);
      setAllCredentials(cachedAllCredentials);
    } catch (err: unknown) {
      console.error('Erro ao verificar credenciais:', err);
      setHasCredentials(false);
    } finally {
      sharedLoadPromise = null;
      setIsLoading(false);
    }
  }, [useCases]);

  useEffect(() => {
    loadAll();

    const listener = () => {
      loadAll();
    };
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, [loadAll]);

  const saveSigaa = async (creds: SigaaCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await useCases.saveCredentials.saveSigaa(creds);
      if (res.success) {
        cachedAllCredentials = { ...cachedAllCredentials, sigaa: creds };
        cachedHasCredentials = true;
        setAllCredentials(cachedAllCredentials);
        setHasCredentials(true);
        await loadAll();
        notifyListeners();
        return { success: true, detail: res.detail };
      }
      const err = humanizeError(res.error, 'Erro ao validar credenciais do SIGAA.');
      setError(err);
      return { success: false, error: err };
    } catch (e) {
      const err = humanizeError(e, 'Erro inesperado ao validar credenciais do SIGAA.');
      setError(err);
      return { success: false, error: err };
    } finally {
      setIsLoading(false);
    }
  };

  const saveAprender3 = async (creds: Aprender3Credentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await useCases.saveCredentials.saveAprender3(creds);
      if (res.success) {
        cachedAllCredentials = { ...cachedAllCredentials, aprender3: creds };
        cachedHasCredentials = true;
        setAllCredentials(cachedAllCredentials);
        setHasCredentials(true);
        await loadAll();
        notifyListeners();
        return { success: true, detail: res.detail };
      }
      const err = humanizeError(res.error, 'Erro ao validar credenciais do Aprender 3.');
      setError(err);
      return { success: false, error: err };
    } catch (e) {
      const err = humanizeError(e, 'Erro inesperado ao validar credenciais do Aprender 3.');
      setError(err);
      return { success: false, error: err };
    } finally {
      setIsLoading(false);
    }
  };

  const saveTeams = async (creds: TeamsCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await useCases.saveCredentials.saveTeams(creds);
      if (res.success) {
        cachedAllCredentials = { ...cachedAllCredentials, teams: creds };
        cachedHasCredentials = true;
        setAllCredentials(cachedAllCredentials);
        setHasCredentials(true);
        await loadAll();
        notifyListeners();
        return { success: true, detail: res.detail || 'Microsoft Teams conectado com sucesso!' };
      }
      const err = humanizeError(res.error, 'Erro ao conectar conta do Teams.');
      setError(err);
      return { success: false, error: err };
    } catch (e) {
      const err = humanizeError(e, 'Erro inesperado ao conectar conta do Teams.');
      setError(err);
      return { success: false, error: err };
    } finally {
      setIsLoading(false);
    }
  };

  const clearPlatform = async (platform: PlatformType) => {
    setIsLoading(true);
    try {
      await useCases.getCredentials.clearPlatform(platform);
      const updated = { ...cachedAllCredentials };
      delete updated[platform];
      cachedAllCredentials = updated;
      setAllCredentials(cachedAllCredentials);
      await loadAll();
      notifyListeners();
    } finally {
      setIsLoading(false);
    }
  };

  const clearAll = async () => {
    setIsLoading(true);
    try {
      await useCases.getCredentials.clearCredentials();
      cachedAllCredentials = {};
      cachedHasCredentials = false;
      setAllCredentials({});
      setHasCredentials(false);
      await loadAll();
      notifyListeners();
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    allCredentials,
    hasCredentials,
    isLoading,
    error,
    clearError,
    saveSigaa,
    saveAprender3,
    saveTeams,
    clearPlatform,
    clearAll,
    refresh: loadAll,
  };
}
