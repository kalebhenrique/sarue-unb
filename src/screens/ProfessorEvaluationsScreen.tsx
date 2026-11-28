import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useProfessorEvaluations } from "../hooks/useProfessorEvaluations";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useContainer } from "../context/ContainerContext";
import { subscribeToSyncComplete } from "../context/SyncContext";
import { resolveCourseIdForProfile } from "../hooks/useMyCourse";
import { STORAGE_KEYS } from "../lib/storage-keys";
import {
  PageContainer,
  PageHeader,
  Card,
  Button,
  Alert,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FloatingActionButton,
  HeaderIconButton,
  Pagination,
  Skeleton,
} from "@/components/ui";
import {
  MessageSquareQuote,
  MessageSquarePlus,
  RefreshCw,
  ExternalLink,
  Info,
  MoreVertical,
} from "lucide-react";
import { openExternalUrl } from "../lib/utils";
import {
  professorKeyOf,
  PROFESSOR_EVALUATIONS_SHEET_URL,
  type ProfessorSummary,
  type DisciplineSummary,
  type CurriculumStructure,
} from "@/core";
import {
  PAGE_SIZE,
  FILTER_BY_COURSE_STORAGE_KEY,
  type EvaluationViewMode,
  EvaluationDrillDown,
  DisciplineDrillDown,
  ProfessorCatalogCard,
  DisciplineCatalogCard,
  EvaluationsToolbar,
} from "@/components/evaluations";

let cachedEvaluationViewMode: EvaluationViewMode = "professors";

// Formulário da comunidade para enviar um novo relato de professor.
const PROFESSOR_EVALUATIONS_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSclOkCc4GtNf-wEKu0iIeLBFQ7rX34kR7C5bDI9O9mKhd_8gA/viewform";

export const ProfessorEvaluationsScreen: React.FC = () => {
  const {
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
    retry,
  } = useProfessorEvaluations();
  const { useCases, repos } = useContainer();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const hasAutoOpenedAboutRef = useRef(false);

  const handleAboutDialogOpenChange = useCallback((open: boolean) => {
    setAboutDialogOpen(open);
    if (!open) {
      try {
        window.localStorage.setItem(STORAGE_KEYS.EVALUATIONS_ABOUT_SEEN, "true");
      } catch {}
    }
  }, []);

  // Na primeira visita em dispositivos mobile, exibe automaticamente o aviso
  // "Sobre os relatos" (no desktop o Alert amarelo já fica visível na página).
  useEffect(() => {
    if (
      hasAutoOpenedAboutRef.current ||
      !isMobile ||
      (isLoading && !hasLoadedOnce) ||
      (error && !hasLoadedOnce)
    ) {
      return;
    }
    try {
      if (window.localStorage.getItem(STORAGE_KEYS.EVALUATIONS_ABOUT_SEEN) === "true") {
        hasAutoOpenedAboutRef.current = true;
        return;
      }
    } catch {}
    hasAutoOpenedAboutRef.current = true;
    setAboutDialogOpen(true);
  }, [isMobile, isLoading, hasLoadedOnce, error]);

  // Valor inicial vem do localStorage; o setter grava a escolha para as
  // próximas visitas. Sem preferência salva (ou storage bloqueado), liga.
  const [filterByCourse, setFilterByCourseState] = useState<boolean>(() => {
    try {
      return (
        window.localStorage.getItem(FILTER_BY_COURSE_STORAGE_KEY) !== "false"
      );
    } catch {
      return true;
    }
  });

  const setFilterByCourse = useCallback((checked: boolean) => {
    setFilterByCourseState(checked);
    try {
      window.localStorage.setItem(
        FILTER_BY_COURSE_STORAGE_KEY,
        String(checked),
      );
    } catch {}
  }, []);

  const [hasCourseProfile, setHasCourseProfile] = useState(false);
  const [courseCodes, setCourseCodes] = useState<Set<string>>(new Set());

  const loadCourseScope = useCallback(async () => {
    try {
      const profile = await useCases.manageAcademicProfile.getProfile();
      if (!profile) {
        setHasCourseProfile(false);
        setCourseCodes(new Set());
        return;
      }
      setHasCourseProfile(true);

      const courseId = await resolveCourseIdForProfile(
        profile,
        repos.gradeRepo,
      );
      if (!courseId) {
        setCourseCodes(new Set());
        return;
      }
      const curricula =
        await useCases.manageAcademicProfile.getCurriculaForCourse(courseId);
      if (!curricula.length) {
        setCourseCodes(new Set());
        return;
      }

      // Matriz atual do usuário + a mais recente do curso.
      const sorted = [...curricula].sort((a, b) =>
        (b.createdYear ?? "").localeCompare(a.createdYear ?? ""),
      );
      const picked = new Map<string, CurriculumStructure>();
      const userCurriculum = curricula.find(
        (c) =>
          c.code === profile.curriculumCode || c.id === profile.curriculumId,
      );
      if (userCurriculum) picked.set(userCurriculum.id, userCurriculum);
      if (sorted[0]) picked.set(sorted[0].id, sorted[0]);
      if (picked.size === 0) {
        for (const c of curricula) picked.set(c.id, c);
      }

      const codes = new Set<string>();
      for (const c of picked.values()) {
        for (const d of [
          ...c.mandatoryDisciplines,
          ...c.electiveDisciplines,
          ...c.complementaryDisciplines,
        ]) {
          if (d.code) codes.add(d.code.toUpperCase());
        }
      }
      // Disciplinas adicionadas pelo usuário no Gerenciar currículo.
      const custom = profile.customCurriculum;
      if (custom) {
        for (const d of [
          ...custom.mandatoryDisciplines,
          ...custom.electiveDisciplines,
          ...custom.complementaryDisciplines,
        ]) {
          if (d.code) codes.add(d.code.toUpperCase());
        }
      }
      setCourseCodes(codes);
    } catch (e) {
      console.warn(
        "[Avaliações] Não foi possível carregar as matrizes do curso:",
        e,
      );
    }
  }, [useCases, repos]);

  useEffect(() => {
    void loadCourseScope();
    // Reexecuta quando uma sincronização termina: o perfil pode ter acabado
    // de ser criado (primeiro login) ou mudado de curso.
    const unsubscribe = subscribeToSyncComplete(() => {
      void loadCourseScope();
    });
    return unsubscribe;
  }, [loadCourseScope]);

  const [viewMode, setViewMode] = useState<EvaluationViewMode>(
    cachedEvaluationViewMode,
  );
  const [selectedProfessor, setSelectedProfessor] =
    useState<ProfessorSummary | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] =
    useState<DisciplineSummary | null>(null);
  const [previousDiscipline, setPreviousDiscipline] =
    useState<DisciplineSummary | null>(null);

  // Armazena e restaura a posição do scroll ao navegar entre catálogo e drill-down
  const catalogScroll = useScrollRestore();
  const disciplineScroll = useScrollRestore();
  const isReturningFromDrillDownRef = React.useRef(false);

  const handleOpenProfessor = useCallback(
    (prof: ProfessorSummary) => {
      catalogScroll.save();
      setSelectedProfessor(prof);
    },
    [catalogScroll],
  );

  const handleOpenDiscipline = useCallback(
    (disc: DisciplineSummary) => {
      catalogScroll.save();
      setSelectedDiscipline(disc);
    },
    [catalogScroll],
  );

  // Restaura o scroll do catálogo quando o usuário volta de uma visualização detalhada
  useEffect(() => {
    if (
      !selectedProfessor &&
      !selectedDiscipline &&
      isReturningFromDrillDownRef.current
    ) {
      isReturningFromDrillDownRef.current = false;
      catalogScroll.restore();
    }
  }, [selectedProfessor, selectedDiscipline, catalogScroll]);

  // Professores da disciplina em drill-down, com o histórico completo de cada
  // um (as notas do card agregam todas as disciplinas do docente). Base SEM
  // filtro: a busca da listagem não pode encolher o elenco do drill-down.
  const disciplineProfessors = useMemo(() => {
    if (!selectedDiscipline) return [] as ProfessorSummary[];
    const byKey = new Map<string, ProfessorSummary>();
    for (const s of unfilteredSummaries) byKey.set(s.professorKey, s);
    const seen = new Map<string, ProfessorSummary>();
    for (const ev of selectedDiscipline.evaluations) {
      const key = professorKeyOf(ev.professor);
      if (key && !seen.has(key)) {
        const prof = byKey.get(key);
        if (prof) seen.set(key, prof);
      }
    }
    return [...seen.values()].sort(
      (a, b) =>
        b.recommendationRate - a.recommendationRate ||
        b.evaluationsCount - a.evaluationsCount,
    );
  }, [selectedDiscipline, unfilteredSummaries]);

  const switchViewMode = (mode: EvaluationViewMode) => {
    cachedEvaluationViewMode = mode;
    setViewMode(mode);
  };

  const [page, setPage] = useState(1);

  useEffect(() => {
    catalogScroll.reset();
    setPage(1);
  }, [
    catalogScroll,
    searchQuery,
    selectedCampus,
    selectedDifficulty,
    sortBy,
    viewMode,
  ]);

  const handleCatalogPageChange = (newPage: number) => {
    setPage(newPage);
    catalogScroll.reset();
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading && !hasLoadedOnce) {
    return (
      <PageContainer>
        <PageHeader icon={MessageSquareQuote} title="Docentes" />
        <div role="status" aria-busy="true">
          <span className="sr-only">
            Carregando avaliações de professores...
          </span>
          <Card className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </Card>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 space-y-4">
              <div className="flex justify-between">
                <div className="space-y-2 w-2/3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-6 w-3/4" />
                </div>
                <Skeleton className="h-12 w-20" />
              </div>
              <Skeleton className="h-20 w-full" />
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  // Estado de erro na primeira carga: nunca vender falha como "filtros sem resultado"
  if (error && !hasLoadedOnce) {
    return (
      <PageContainer>
        <PageHeader icon={MessageSquareQuote} title="Docentes" />
        <EmptyState
          title="Não conseguimos carregar os relatos"
          description="Ocorreu um problema ao buscar as avaliações da comunidade. Verifique sua conexão e tente de novo."
          action={
            <Button type="button" variant="primary" size="sm" onClick={retry}>
              <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
              Tentar novamente
            </Button>
          }
        />
      </PageContainer>
    );
  }

  // Drill-down: Visualizando todas as avaliações de um professor específico
  if (selectedProfessor) {
    return (
      <EvaluationDrillDown
        icon={MessageSquareQuote}
        title={selectedProfessor.professorName}
        relatedLabel="Disciplinas Avaliadas"
        relatedItems={selectedProfessor.disciplines}
        summary={selectedProfessor}
        onBack={() => {
          if (previousDiscipline) {
            setSelectedProfessor(null);
            setSelectedDiscipline(previousDiscipline);
            setPreviousDiscipline(null);
          } else {
            isReturningFromDrillDownRef.current = true;
            setSelectedProfessor(null);
          }
        }}
      />
    );
  }

  // Drill-down: disciplina como hub de professores — cada card abre o histórico
  // completo (relatos) do docente.
  if (selectedDiscipline) {
    return (
      <DisciplineDrillDown
        summary={selectedDiscipline}
        professorSummaries={disciplineProfessors}
        initialScrollTop={disciplineScroll.savedTopRef.current}
        onBack={() => {
          disciplineScroll.reset();
          isReturningFromDrillDownRef.current = true;
          setSelectedDiscipline(null);
        }}
        onOpenProfessor={(prof) => {
          disciplineScroll.save();
          setPreviousDiscipline(selectedDiscipline);
          setSelectedDiscipline(null);
          setSelectedProfessor(prof);
        }}
      />
    );
  }

  const disciplineCodeOf = (name: string): string | null =>
    name.match(/[A-Z]{3}\d{4}/)?.[0]?.toUpperCase() ?? null;

  const courseFilterActive =
    filterByCourse && hasCourseProfile && courseCodes.size > 0;

  const visibleSummaries = courseFilterActive
    ? summaries.filter((s) =>
        s.disciplines.some((d) => {
          const code = disciplineCodeOf(d);
          return code ? courseCodes.has(code) : false;
        }),
      )
    : summaries;

  const visibleDisciplines = courseFilterActive
    ? disciplineSummaries.filter((s) => {
        if (
          s.disciplineCode &&
          courseCodes.has(s.disciplineCode.toUpperCase())
        ) {
          return true;
        }
        const code = disciplineCodeOf(s.disciplineName);
        return code ? courseCodes.has(code) : false;
      })
    : disciplineSummaries;

  const totalListCount =
    viewMode === "professors"
      ? visibleSummaries.length
      : visibleDisciplines.length;
  const pageCount = Math.max(1, Math.ceil(totalListCount / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageSummaries = visibleSummaries.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const pageDisciplines = visibleDisciplines.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <PageContainer>
      <PageHeader
        icon={MessageSquareQuote}
        title="Docentes"
        count={unfilteredSummaries.length > 0 ? unfilteredSummaries.length : null}
        subtitle={
          unfilteredSummaries.length > 0
            ? `(${unfilteredSummaries.length} ${unfilteredSummaries.length === 1 ? "docente" : "docentes"})`
            : null
        }
        mobileActions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <HeaderIconButton aria-label="Mais ações das avaliações">
                  <MoreVertical className="w-4 h-4 stroke-[2.5]" />
                </HeaderIconButton>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAboutDialogOpen(true)}>
                <Info className="w-4 h-4 stroke-[2.5]" />
                Sobre os relatos
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openExternalUrl(PROFESSOR_EVALUATIONS_SHEET_URL)}
              >
                <ExternalLink className="w-4 h-4 stroke-[2.5]" />
                Abrir Planilha
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openExternalUrl(PROFESSOR_EVALUATIONS_FORM_URL)}
              >
                <ExternalLink className="w-4 h-4 stroke-[2.5]" />
                Abrir Formulário
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Aviso permanente no desktop: origem e responsabilidade do conteúdo */}
      <Alert
        className="hidden md:flex"
        variant="yellow"
        title="Sobre os relatos"
        description={
          <>
            Estes relatos vêm de uma fonte externa: uma planilha pública
            mantida pela própria comunidade de estudantes, sem moderação
            prévia:{" "}
            <strong className="font-bold text-black">
              palavrões e palavras de baixo calão são censurados
              automaticamente pela plataforma
            </strong>
            . Cada opinião reflete a visão de quem escreveu — pode vir
            enviesada, desatualizada ou até conter ofensas. Use as avaliações
            como apoio na sua decisão, e não como verdade absoluta.
          </>
        }
        aside={
          <div className="flex flex-col items-stretch gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openExternalUrl(PROFESSOR_EVALUATIONS_SHEET_URL)}
              title="Abrir planilha colaborativa no Google Sheets"
              className="dark:bg-neo-yellow dark:text-ink dark:hover:bg-neo-yellowHover"
            >
              <span>Planilha</span>
              <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openExternalUrl(PROFESSOR_EVALUATIONS_FORM_URL)}
              title="Abrir o formulário para enviar um novo relato"
              className="dark:bg-neo-yellow dark:text-ink dark:hover:bg-neo-yellowHover"
            >
              <span>Formulário</span>
              <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
            </Button>
          </div>
        }
      />

      {/* Modal mobile: "Sobre os relatos" (abre automaticamente na 1ª visita e via menu) */}
      <Dialog open={aboutDialogOpen} onOpenChange={handleAboutDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-9 h-9 rounded-lg bg-neo-yellow text-ink border-2 border-ink flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <Info className="w-5 h-5 stroke-[2.5]" />
              </div>
              <DialogTitle>Sobre os relatos</DialogTitle>
            </div>
            <DialogDescription className="text-xs font-medium leading-relaxed text-neutral-700 pt-1">
              Estes relatos vêm de uma fonte externa: uma planilha pública mantida
              pela própria comunidade de estudantes, sem moderação prévia:{" "}
              <strong className="font-bold text-black">
                palavrões e palavras de baixo calão são censurados
                automaticamente pela plataforma
              </strong>
              . Cada opinião reflete a visão de quem escreveu — pode vir
              enviesada, desatualizada ou até conter ofensas. Use as avaliações
              como apoio na sua decisão, e não como verdade absoluta.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openExternalUrl(PROFESSOR_EVALUATIONS_SHEET_URL)}
              className="min-h-11 md:min-h-8"
            >
              <span>Planilha</span>
              <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openExternalUrl(PROFESSOR_EVALUATIONS_FORM_URL)}
              className="min-h-11 md:min-h-8"
            >
              <span>Formulário</span>
              <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
            </Button>
          </div>

          <DialogFooter className="pt-0">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => handleAboutDialogOpenChange(false)}
              className="w-full sm:w-auto min-h-11 md:min-h-10"
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Barra de Busca e Filtros */}
      <EvaluationsToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={switchViewMode}
        selectedCampus={selectedCampus}
        onCampusChange={setSelectedCampus}
        selectedDifficulty={selectedDifficulty}
        onDifficultyChange={setSelectedDifficulty}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        hasCourseProfile={hasCourseProfile}
        filterByCourse={filterByCourse}
        onFilterByCourseChange={setFilterByCourse}
        visibleCount={
          viewMode === "professors"
            ? visibleSummaries.length
            : visibleDisciplines.length
        }
        totalCount={
          viewMode === "professors"
            ? unfilteredSummaries.length
            : unfilteredDisciplineSummaries.length
        }
      />

      {/* Conteúdo Principal */}
      {totalListCount === 0 ? (
        <EmptyState
          title="Nenhuma avaliação encontrada"
          description="Não encontramos relatos para os filtros selecionados. Tente buscar por outro termo ou limpe os filtros."
        />
      ) : viewMode === "professors" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageSummaries.map((prof) => (
              <ProfessorCatalogCard
                key={prof.professorKey}
                prof={prof}
                onClick={() => handleOpenProfessor(prof)}
              />
            ))}
          </div>

          <Pagination
            page={safePage}
            pageCount={pageCount}
            onPageChange={handleCatalogPageChange}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageDisciplines.map((disc) => (
              <DisciplineCatalogCard
                key={disc.disciplineKey}
                disc={disc}
                onClick={() => handleOpenDiscipline(disc)}
              />
            ))}
          </div>

          <Pagination
            page={safePage}
            pageCount={pageCount}
            onPageChange={handleCatalogPageChange}
          />
        </div>
      )}

      <FloatingActionButton
        variant="primary"
        icon={MessageSquarePlus}
        aria-label="Enviar relato"
        title="Enviar relato"
        onClick={() => openExternalUrl(PROFESSOR_EVALUATIONS_FORM_URL)}
        className="md:hidden"
      />
    </PageContainer>
  );
};
