import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useContainer } from './ContainerContext';
import { subscribeToFeedUpdates } from '../hooks/useFeed';
import { subscribeToSyncComplete } from './SyncContext';
import type { DeadlineEntry, Discipline } from '@/core';

interface DeadlineContextValue {
  entries: DeadlineEntry[];
  badgeCount: number;
  disciplines: Discipline[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
  refresh: () => Promise<void>;
}

const DeadlineContext = createContext<DeadlineContextValue | null>(null);

/**
 * Avalia prazos (abertura do app, pós-sync e mudanças no feed) e publica o
 * buffer curto de prazos para o sino e o painel. Sem processo em fundo:
 * a checagem vive nesses três gatilhos.
 */
export const DeadlineProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { useCases } = useContainer();
  const [entries, setEntries] = useState<DeadlineEntry[]>([]);
  const [badgeCount, setBadgeCount] = useState<number>(0);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);
  const hasLoadedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }
    try {
      const [result, disciplinesResult] = await Promise.all([
        useCases.evaluateDeadlines.execute(),
        useCases.getCourses.getDisciplines().catch(() => null),
      ]);
      setEntries(result.entries);
      setBadgeCount(result.badgeCount);
      if (disciplinesResult) {
        setDisciplines(disciplinesResult.disciplines);
      }
    } catch (err) {
      console.error('Erro ao avaliar prazos:', err);
    } finally {
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
      setIsLoading(false);
    }
  }, [useCases]);

  useEffect(() => {
    refresh();

    const unsubscribeFeed = subscribeToFeedUpdates(refresh);
    const unsubscribeSync = subscribeToSyncComplete(refresh);

    return () => {
      unsubscribeFeed();
      unsubscribeSync();
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      entries,
      badgeCount,
      disciplines,
      isLoading,
      hasLoadedOnce,
      refresh,
    }),
    [entries, badgeCount, disciplines, isLoading, hasLoadedOnce, refresh],
  );

  return (
    <DeadlineContext.Provider value={value}>
      {children}
    </DeadlineContext.Provider>
  );
};

export function useDeadlines(): DeadlineContextValue {
  const context = useContext(DeadlineContext);
  if (!context) {
    throw new Error(
      'useDeadlines deve ser utilizado dentro de um DeadlineProvider',
    );
  }
  return context;
}
