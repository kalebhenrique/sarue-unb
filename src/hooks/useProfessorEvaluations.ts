import { useState, useEffect, useCallback, useMemo } from 'react';
import { useContainer } from '../context/ContainerContext';
import type {
  ProfessorEvaluation,
  ProfessorSummary,
  DisciplineSummary,
  CampusName,
  RecommendationType,
  DifficultyLevel,
  AttendanceStrictness,
  ProfessorEvaluationSortBy,
} from '@/core';

export function useProfessorEvaluations() {
  const { useCases } = useContainer();

  const [evaluations, setEvaluations] = useState<ProfessorEvaluation[]>([]);
  const [summaries, setSummaries] = useState<ProfessorSummary[]>([]);
  const [disciplineSummaries, setDisciplineSummaries] = useState<
    DisciplineSummary[]
  >([]);
  const [allCount, setAllCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  // Filtros e parâmetros de busca
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCampus, setSelectedCampus] = useState<CampusName | 'all'>(
    'all'
  );
  const [selectedDifficulty, setSelectedDifficulty] = useState<
    DifficultyLevel | 'all'
  >('all');
  const [selectedAttendance, setSelectedAttendance] = useState<
    AttendanceStrictness | 'all'
  >('all');
  const [sortBy, setSortBy] = useState<ProfessorEvaluationSortBy>(
    'recommendation_desc'
  );

  const loadData = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const filters = {
          query: searchQuery,
          campus: selectedCampus,
          difficulty: selectedDifficulty,
          attendance: selectedAttendance,
          sortBy,
        };

        const [
          unfilteredList,
          filteredList,
          summaryList,
          disciplineSummaryList,
        ] = await Promise.all([
          useCases.getProfessorEvaluations.execute(undefined, forceRefresh),
          useCases.getProfessorEvaluations.execute(filters, false),
          useCases.getProfessorEvaluations.getSummaries(filters, false),
          useCases.getProfessorEvaluations.getDisciplineSummaries(
            filters,
            false
          ),
        ]);

        setAllCount(unfilteredList.length);
        setEvaluations(filteredList);
        setSummaries(summaryList);
        setDisciplineSummaries(disciplineSummaryList);
        setHasLoadedOnce(true);
        setError(false);
        return true;
      } catch (err) {
        console.error('Erro ao carregar avaliações de professores:', err);
        setError(true);
        return false;
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      useCases,
      searchQuery,
      selectedCampus,
      selectedDifficulty,
      selectedAttendance,
      sortBy,
    ]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const stats = useMemo(() => {
    const totalReviews = evaluations.length;
    const totalProfessors = summaries.length;
    const totalDisciplines = disciplineSummaries.length;

    const scores = evaluations
      .map((e) => e.didaticaScore)
      .filter((s): s is number => s !== null && !Number.isNaN(s));

    const averageDidatica =
      scores.length > 0
        ? Math.round(
            (scores.reduce((acc, s) => acc + s, 0) / scores.length) * 10
          ) / 10
        : 0;

    const recommendYes = evaluations.filter(
      (e) => e.recommendation === 'sim'
    ).length;
    const recommendationRate =
      totalReviews > 0 ? Math.round((recommendYes / totalReviews) * 100) : 0;

    return {
      totalReviews,
      totalProfessors,
      totalDisciplines,
      averageDidatica,
      recommendationRate,
    };
  }, [evaluations, summaries, disciplineSummaries]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCampus('all');
    setSelectedDifficulty('all');
    setSelectedAttendance('all');
    setSortBy('recommendation_desc');
  }, []);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCampus !== 'all' ||
    selectedDifficulty !== 'all' ||
    selectedAttendance !== 'all';

  return {
    evaluations,
    summaries,
    disciplineSummaries,
    allCount,
    stats,
    isLoading,
    isRefreshing,
    hasLoadedOnce,
    searchQuery,
    setSearchQuery,
    selectedCampus,
    setSelectedCampus,
    selectedDifficulty,
    setSelectedDifficulty,
    selectedAttendance,
    setSelectedAttendance,
    sortBy,
    setSortBy,
    hasActiveFilters,
    clearFilters,
    error,
    retry: () => loadData(false),
    refresh: () => loadData(true),
  };
}
