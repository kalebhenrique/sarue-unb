import { useState, useEffect, useCallback, useDeferredValue } from "react";
import { useContainer } from "../context/ContainerContext";
import type {
  FeedItem,
  Course,
  PlatformType,
  FeedItemType,
  Discipline,
} from "@/core";

// Notificador global entre instâncias ativas do hook useFeed
const feedListeners = new Set<() => void>();

interface FeedSessionSnapshot {
  items: FeedItem[];
  totalItems: number;
  courses: Course[];
  disciplines: Discipline[];
  unmatchedCourses: Course[];
  otherCourses: Course[];
}

// Cache de sessão em memória (padrão useMyCourse): evita exibir o skeleton
// novamente a cada troca de aba entre Início e Disciplinas após a 1ª carga.
let cachedFeedSnapshot: FeedSessionSnapshot | null = null;

export function notifyFeedListeners() {
  feedListeners.forEach((fn) => fn());
}

/** Assina atualizações globais do feed (sync, conclusão, arquivamento). */
export function subscribeToFeedUpdates(listener: () => void): () => void {
  feedListeners.add(listener);
  return () => {
    feedListeners.delete(listener);
  };
}

export function useFeed() {
  const { useCases } = useContainer();
  const [items, setItems] = useState<FeedItem[]>(
    () => cachedFeedSnapshot?.items ?? [],
  );
  // Contagem absoluta do feed ativo (sem filtros): alimenta o título da página
  const [totalItems, setTotalItems] = useState<number>(
    () => cachedFeedSnapshot?.totalItems ?? 0,
  );
  const [courses, setCourses] = useState<Course[]>(
    () => cachedFeedSnapshot?.courses ?? [],
  );
  const [disciplines, setDisciplines] = useState<Discipline[]>(
    () => cachedFeedSnapshot?.disciplines ?? [],
  );
  const [unmatchedCourses, setUnmatchedCourses] = useState<Course[]>(
    () => cachedFeedSnapshot?.unmatchedCourses ?? [],
  );
  const [otherCourses, setOtherCourses] = useState<Course[]>(
    () => cachedFeedSnapshot?.otherCourses ?? [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => cachedFeedSnapshot === null,
  );
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(
    () => cachedFeedSnapshot !== null,
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<Partial<
    Record<PlatformType, string>
  > | null>(null);

  const [selectedPlatform, setSelectedPlatform] = useState<
    PlatformType | "all"
  >("all");
  const [selectedType, setSelectedType] = useState<FeedItemType | "all">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDeferredValue(searchQuery);
  const [showArchived, setShowArchived] = useState<boolean>(false);

  const loadFeed = useCallback(async () => {
    if (!cachedFeedSnapshot) {
      setIsLoading(true);
    }
    try {
      const [feedItems, absoluteItems, courseList, disciplinesResult] =
        await Promise.all([
          useCases.getFeed.execute({
            platform: selectedPlatform,
            itemType: selectedType,
            searchQuery: debouncedSearchQuery,
            onlyArchived: showArchived ? true : undefined,
          }),
          useCases.getFeed.execute({
            onlyArchived: false,
          }),
          useCases.getCourses.execute(),
          useCases.getCourses.getDisciplines(),
        ]);

      setItems(feedItems);
      setHasLoadedOnce(true);
      setTotalItems(absoluteItems.length);
      setCourses(courseList);
      setDisciplines(disciplinesResult.disciplines);
      setUnmatchedCourses(disciplinesResult.unmatchedCourses);
      setOtherCourses(disciplinesResult.otherCourses);

      const isDefaultFilter =
        selectedPlatform === "all" &&
        selectedType === "all" &&
        !debouncedSearchQuery &&
        !showArchived;

      cachedFeedSnapshot = {
        items: isDefaultFilter ? feedItems : absoluteItems,
        totalItems: absoluteItems.length,
        courses: courseList,
        disciplines: disciplinesResult.disciplines,
        unmatchedCourses: disciplinesResult.unmatchedCourses,
        otherCourses: disciplinesResult.otherCourses,
      };
    } catch (err) {
      console.error("Erro ao carregar dados do feed e disciplinas:", err);
    } finally {
      setIsLoading(false);
    }
  }, [
    useCases,
    selectedPlatform,
    selectedType,
    debouncedSearchQuery,
    showArchived,
  ]);

  useEffect(() => {
    loadFeed();

    const listener = () => {
      loadFeed();
    };
    feedListeners.add(listener);

    return () => {
      feedListeners.delete(listener);
    };
  }, [loadFeed]);

  const sync = async (platforms?: PlatformType[]) => {
    setIsSyncing(true);
    setSyncErrors(null);
    try {
      const result = await useCases.syncPlatforms.execute(platforms);
      setItems(result.items);
      setHasLoadedOnce(true);
      setTotalItems(result.items.length);
      setCourses(result.courses);
      setLastSyncedAt(result.syncedAt);

      const disciplinesResult = await useCases.getCourses.getDisciplines();
      setDisciplines(disciplinesResult.disciplines);
      setUnmatchedCourses(disciplinesResult.unmatchedCourses);
      setOtherCourses(disciplinesResult.otherCourses);

      cachedFeedSnapshot = {
        items: result.items,
        totalItems: result.items.length,
        courses: result.courses,
        disciplines: disciplinesResult.disciplines,
        unmatchedCourses: disciplinesResult.unmatchedCourses,
        otherCourses: disciplinesResult.otherCourses,
      };

      if (result.errors && Object.keys(result.errors).length > 0) {
        setSyncErrors(result.errors);
      }
      notifyFeedListeners();
      return result;
    } catch (err) {
      console.error("Erro durante a sincronização:", err);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  const clearFeedData = useCallback(async () => {
    setIsLoading(true);
    try {
      await useCases.getFeed.clear();
      cachedFeedSnapshot = null;
      setItems([]);
      setTotalItems(0);
      setCourses([]);
      setDisciplines([]);
      setUnmatchedCourses([]);
      setOtherCourses([]);
      setLastSyncedAt(null);
      notifyFeedListeners();
    } catch (err) {
      console.error("Erro ao limpar dados do feed e turmas:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [useCases]);

  const toggleTaskCompleted = async (id: string, currentStatus?: boolean) => {
    const nextStatus = !currentStatus;
    await useCases.getFeed.markAsCompleted(id, nextStatus);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isCompleted: nextStatus } : item,
      ),
    );
    // Conclusão muda prazos pendentes: o sino e o painel acompanham.
    notifyFeedListeners();
  };

  const archiveFeedItem = async (id: string, isArchived: boolean = true) => {
    await useCases.getFeed.archiveItem(id, isArchived);
    if (!showArchived && isArchived) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    } else if (showArchived && !isArchived) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isArchived } : item)),
      );
    }
  };

  // Ações em lote do modo Selecionar: executa em paralelo no SQLite local e notifica uma vez só no fim.
  const completeTasksBatch = async (ids: string[]) => {
    if (ids.length === 0) return;
    await Promise.all(
      ids.map((id) => useCases.getFeed.markAsCompleted(id, true)),
    );
    setItems((prev) =>
      prev.map((item) =>
        ids.includes(item.id) ? { ...item, isCompleted: true } : item,
      ),
    );
    // Conclusão muda prazos pendentes: o sino e o painel acompanham.
    notifyFeedListeners();
  };

  const archiveItemsBatch = async (ids: string[], isArchived: boolean) => {
    if (ids.length === 0) return;
    await Promise.all(
      ids.map((id) => useCases.getFeed.archiveItem(id, isArchived)),
    );
    // Mesma regra do single: quando o modo atual esconde os itens movidos, saem da lista
    if (showArchived !== isArchived) {
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
    } else {
      setItems((prev) =>
        prev.map((item) =>
          ids.includes(item.id) ? { ...item, isArchived } : item,
        ),
      );
    }
  };

  const associateCourse = async (
    aprenderCourseId: string,
    sigaaCourseId: string | null,
    isIgnored: boolean = false,
  ) => {
    await useCases.getCourses.associateCourse(
      aprenderCourseId,
      sigaaCourseId,
      isIgnored,
    );
    const disciplinesResult = await useCases.getCourses.getDisciplines();
    setDisciplines(disciplinesResult.disciplines);
    setUnmatchedCourses(disciplinesResult.unmatchedCourses);
    setOtherCourses(disciplinesResult.otherCourses);
    notifyFeedListeners();
  };

  return {
    items,
    totalItems,
    courses,
    disciplines,
    unmatchedCourses,
    otherCourses,
    isLoading,
    hasLoadedOnce,
    isSyncing,
    lastSyncedAt,
    syncErrors,
    selectedPlatform,
    setSelectedPlatform,
    selectedType,
    setSelectedType,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    sync,
    clearFeedData,
    refresh: loadFeed,
    toggleTaskCompleted,
    archiveFeedItem,
    completeTasksBatch,
    archiveItemsBatch,
    associateCourse,
  };
}
