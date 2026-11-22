import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useDeferredValue,
} from "react";
import { useContainer } from "../context/ContainerContext";
import { subscribeToSyncComplete } from "../context/SyncContext";
import type {
  ProfessorSummary,
  DisciplineSummary,
  CampusName,
  DifficultyLevel,
  ProfessorEvaluationSortBy,
} from "@/core";

interface EvaluationsSessionSnapshot {
  summaries: ProfessorSummary[];
  disciplineSummaries: DisciplineSummary[];
  unfilteredSummaries: ProfessorSummary[];
  unfilteredDisciplineSummaries: DisciplineSummary[];
}

let cachedEvalSnapshot: EvaluationsSessionSnapshot | null = null;

export function useProfessorEvaluations() {
  const { useCases } = useContainer();

  const [summaries, setSummaries] = useState<ProfessorSummary[]>(
    () => cachedEvalSnapshot?.summaries ?? [],
  );
  const [disciplineSummaries, setDisciplineSummaries] = useState<
    DisciplineSummary[]
  >(() => cachedEvalSnapshot?.disciplineSummaries ?? []);
  // Agregados SEM filtro: base fixa para contagem absoluta (título, barra
  // "N de M") e drill-downs, imune a busca/filtros.
  const [unfilteredSummaries, setUnfilteredSummaries] = useState<
    ProfessorSummary[]
  >(() => cachedEvalSnapshot?.unfilteredSummaries ?? []);
  const [unfilteredDisciplineSummaries, setUnfilteredDisciplineSummaries] =
    useState<DisciplineSummary[]>(
      () => cachedEvalSnapshot?.unfilteredDisciplineSummaries ?? [],
    );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => cachedEvalSnapshot === null,
  );
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(
    () => cachedEvalSnapshot !== null,
  );
  const hasLoadedOnceRef = useRef<boolean>(cachedEvalSnapshot !== null);
  const [error, setError] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedQuery = useDeferredValue(searchQuery);
  const [selectedCampus, setSelectedCampus] = useState<CampusName | "all">(
    "all",
  );
  const [selectedDifficulty, setSelectedDifficulty] = useState<
    DifficultyLevel | "all"
  >("all");
  const [sortBy, setSortBy] = useState<ProfessorEvaluationSortBy>(
    "recommendation_desc",
  );

  const loadData = useCallback(
    async (forceRefresh = false) => {
      const needsBaseLoad = forceRefresh || !hasLoadedOnceRef.current;
      if (needsBaseLoad) {
        setIsLoading(true);
      }

      try {
        const filters = {
          query: debouncedQuery,
          campus: selectedCampus,
          difficulty: selectedDifficulty,
          sortBy,
        };

        if (needsBaseLoad) {
          // Aquece/atualiza a base enriquecida uma única vez antes de agregar
          await useCases.getProfessorEvaluations.execute(
            undefined,
            forceRefresh,
          );
          const [
            summaryList,
            disciplineSummaryList,
            unfilteredSummaryList,
            unfilteredDisciplineSummaryList,
          ] = await Promise.all([
            useCases.getProfessorEvaluations.getSummaries(filters, false),
            useCases.getProfessorEvaluations.getDisciplineSummaries(
              filters,
              false,
            ),
            useCases.getProfessorEvaluations.getSummaries(undefined, false),
            useCases.getProfessorEvaluations.getDisciplineSummaries(
              undefined,
              false,
            ),
          ]);
          setSummaries(summaryList);
          setDisciplineSummaries(disciplineSummaryList);
          setUnfilteredSummaries(unfilteredSummaryList);
          setUnfilteredDisciplineSummaries(unfilteredDisciplineSummaryList);
          cachedEvalSnapshot = {
            summaries: unfilteredSummaryList,
            disciplineSummaries: unfilteredDisciplineSummaryList,
            unfilteredSummaries: unfilteredSummaryList,
            unfilteredDisciplineSummaries: unfilteredDisciplineSummaryList,
          };
        } else {
          // Em mudanças de filtro/busca, recalcula apenas os agregados filtrados
          const [summaryList, disciplineSummaryList] = await Promise.all([
            useCases.getProfessorEvaluations.getSummaries(filters, false),
            useCases.getProfessorEvaluations.getDisciplineSummaries(
              filters,
              false,
            ),
          ]);
          setSummaries(summaryList);
          setDisciplineSummaries(disciplineSummaryList);
        }

        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
        setError(false);
        return true;
      } catch (err) {
        console.error("Erro ao carregar avaliações de professores:", err);
        setError(true);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [useCases, debouncedQuery, selectedCampus, selectedDifficulty, sortBy],
  );

  useEffect(() => {
    void loadData(false);
    const unsubscribe = subscribeToSyncComplete(() => {
      hasLoadedOnceRef.current = false;
      void loadData(false);
    });
    return unsubscribe;
  }, [loadData]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCampus("all");
    setSelectedDifficulty("all");
    setSortBy("recommendation_desc");
  }, []);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedCampus !== "all" ||
    selectedDifficulty !== "all";

  return {
    summaries,
    disciplineSummaries,
    unfilteredSummaries,
    unfilteredDisciplineSummaries,
    isLoading,
    hasLoadedOnce,
    searchQuery,
    setSearchQuery,
    selectedCampus,
    setSelectedCampus,
    selectedDifficulty,
    setSelectedDifficulty,
    sortBy,
    setSortBy,
    hasActiveFilters,
    clearFilters,
    error,
    retry: () => loadData(false),
    refresh: () => loadData(true),
  };
}
