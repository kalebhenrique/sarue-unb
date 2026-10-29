import React, { useState, useMemo } from "react";
import { useMyCourse } from "../hooks/useMyCourse";
import { FlowchartStats } from "../components/flowchart/FlowchartStats";
import { IraCalculatorScreen } from "./IraCalculatorScreen";
import { CurriculumEditorScreen } from "./CurriculumEditorScreen";
import { FlowchartList } from "../components/flowchart/FlowchartList";
import { FlowchartDiagram } from "../components/flowchart/FlowchartDiagram";
import { CurrentlyEnrolledPanel } from "../components/flowchart/CurrentlyEnrolledPanel";
import { CurriculumSelectorDialog } from "../components/flowchart/CurriculumSelectorDialog";
import { MyCourseSkeleton } from "../components/flowchart/MyCourseSkeleton";
import { useContainer } from "../context/ContainerContext";
import { sendDisciplineToGradeAction } from "../hooks/useGrade";
import {
  PageContainer,
  PageHeader,
  Button,
  Input,
  EmptyState,
  ErrorBoundary,
} from "@/components/ui";
import {
  GraduationCap,
  SlidersHorizontal,
  RotateCcw,
  Search,
  CheckCircle2,
  Unlock,
  BookOpen,
  List,
  Network,
  CircleDotDashed,
} from "lucide-react";

type FilterType =
  "all" | "pending_mandatory" | "completed" | "in_progress" | "available";
type ViewMode = "list" | "map";

// Modo de visualização persiste durante a sessão: voltar de outra aba não reseta
let cachedViewMode: ViewMode = "list";

export const MyCourseScreen: React.FC = () => {
  const container = useContainer();
  const {
    profile,
    curriculum,
    allCurricula,
    flowchartData,
    disciplineNames,
    isLoading,
    toggleDiscipline,
    resetOverrides,
    selectCurriculum,
    reload,
  } = useMyCourse();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [isCurriculumDialogOpen, setIsCurriculumDialogOpen] = useState(false);
  const [view, setView] = useState<
    "overview" | "ira-calculator" | "curriculum-editor"
  >("overview");
  const [viewMode, setViewMode] = useState<ViewMode>(cachedViewMode);

  const switchViewMode = (mode: ViewMode) => {
    cachedViewMode = mode;
    setViewMode(mode);
  };

  const filteredDisciplinesForList = useMemo(() => {
    if (!flowchartData) return [];
    const all: (typeof flowchartData.semesters)[0]["disciplines"] = [];
    for (const sem of flowchartData.semesters) {
      all.push(...sem.disciplines);
    }

    const norm = (v: string) =>
      v
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const query = norm(searchQuery);

    return all.filter((d) => {
      const matchSearch =
        query === "" ||
        norm(d.code).includes(query) ||
        norm(d.name).includes(query);

      const matchFilter =
        activeFilter === "all" ||
        (activeFilter === "pending_mandatory"
          ? d.nature !== "Optativa" &&
            d.nature !== "Complementar" &&
            d.status !== "completed"
          : d.status === activeFilter);

      return matchSearch && matchFilter;
    });
  }, [flowchartData, searchQuery, activeFilter]);

  const filteredCodesSet = useMemo(() => {
    return new Set(filteredDisciplinesForList.map((d) => d.code));
  }, [filteredDisciplinesForList]);

  const inProgressDisciplines = useMemo(() => {
    if (!flowchartData) return [];
    if (
      flowchartData.inProgressDisciplines &&
      flowchartData.inProgressDisciplines.length > 0
    ) {
      return flowchartData.inProgressDisciplines;
    }
    return flowchartData.semesters.flatMap((s) =>
      s.disciplines.filter((d) => d.status === "in_progress"),
    );
  }, [flowchartData]);

  const courseCurricula = useMemo(() => {
    const norm = (v: string) =>
      v
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const course = norm(profile?.courseName || "");
    if (!course) return allCurricula;
    const matched = allCurricula.filter((c) =>
      norm(c.courseName || "").includes(course),
    );
    return matched.length > 0 ? matched : allCurricula;
  }, [allCurricula, profile?.courseName]);

  if (view === "ira-calculator") {
    return (
      <ErrorBoundary
        key="ira-calculator"
        fallbackTitle="Não foi possível abrir a Calculadora de IRA"
        fallbackDescription="Ocorreu um erro inesperado ao carregar o cenário. Seus dados estão preservados."
        onReset={() => setView("overview")}
      >
        <IraCalculatorScreen onBack={() => setView("overview")} />
      </ErrorBoundary>
    );
  }

  if (view === "curriculum-editor") {
    return <CurriculumEditorScreen onBack={() => setView("overview")} />;
  }

  if (isLoading && !profile) {
    return (
      <PageContainer>
        <MyCourseSkeleton />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Meu Curso"
        icon={GraduationCap}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {((profile?.manualCompletedCodes?.length || 0) > 0 ||
              (profile?.manualUncompletedCodes?.length || 0) > 0) && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetOverrides}
                className="text-xs shrink-0"
                title="Restaurar o estado original vindo do histórico"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resetar (
                {(profile?.manualCompletedCodes?.length || 0) +
                  (profile?.manualUncompletedCodes?.length || 0)}{" "}
                alterações)
              </Button>
            )}

            {profile && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setView("curriculum-editor")}
                  title="Editar disciplinas, inserir optativas ou customizar o currículo"
                >
                  <BookOpen className="w-4 h-4 stroke-[2.5]" />
                  Gerenciar Currículo
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCurriculumDialogOpen(true)}
                  title="Trocar ou explorar outra matriz curricular da UnB"
                >
                  <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
                  Trocar Matriz
                </Button>
              </>
            )}
          </div>
        }
      />

      <ErrorBoundary
        key="my-course-overview"
        fallbackTitle="Não foi possível carregar a visualização do curso"
        fallbackDescription="Ocorreu um erro inesperado ao processar os dados curriculares. Tente recarregar ou selecionar uma matriz diferente."
        onReset={() => reload()}
      >
        {!profile ? (
          <EmptyState
            title="Nenhum Perfil Acadêmico Carregado"
            description={
              <>
                Sincronize com o SIGAA na aba <strong>Configurações</strong> para
                carregar seu curso, disciplinas cursadas, IRA e acompanhar seu
                progresso no fluxograma.
              </>
            }
            className="mb-6"
          />
        ) : (
          <>
            <div className="bg-paper border-2 border-ink rounded-lg p-5 mb-6 shadow-neo">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center flex-wrap">
                  <span className="text-lg font-black text-black tracking-tight">
                    {profile.courseName ||
                      curriculum?.courseName ||
                      "Curso de Graduação"}
                  </span>
                </div>
              </div>
            </div>

            {flowchartData ? (
              <FlowchartStats
                metrics={flowchartData.metrics}
                onOpenIraCalculator={() => setView("ira-calculator")}
              />
            ) : !isLoading ? (
              <EmptyState
                title="Matriz Curricular Não Encontrada"
                description="Não foi possível mapear automaticamente a estrutura curricular deste curso. Clique em 'Trocar Matriz' acima para selecionar ou carregar sua matriz oficial."
                className="mb-6"
              />
            ) : null}

          <CurrentlyEnrolledPanel
            disciplines={inProgressDisciplines}
            searchQuery={searchQuery}
          />

          {flowchartData && (
            <section
              className="bg-paper border-2 border-ink rounded-lg shadow-neo"
              aria-label={
                viewMode === "list"
                  ? "Fluxograma de disciplinas por semestre"
                  : "Mapa de cadeias de pré-requisitos"
              }
            >
              <div className="p-4 border-b-2 border-ink space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-neutral-500 stroke-[2.5]" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por código ou nome (ex: APC, Cálculo, CIC0004)..."
                      aria-label="Buscar disciplina por código ou nome"
                      className={`pl-10 h-9 text-xs w-full transition-[background-color] ${
                        searchQuery.trim() ? "bg-pastel-blue" : "bg-paper"
                      }`}
                    />
                  </div>

                  <div
                    role="group"
                    aria-label="Modo de visualização do fluxograma"
                    className="relative grid grid-cols-2 gap-0.5 p-0.5 bg-paper border-2 border-ink rounded-xl shrink-0 self-end sm:self-auto"
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-3px)] rounded-lg bg-neo-blue transition-transform duration-150 ease-out ${
                        viewMode === "map"
                          ? "translate-x-[calc(100%+2px)]"
                          : "translate-x-0"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => switchViewMode("list")}
                      aria-pressed={viewMode === "list"}
                      title="Visualização em lista por semestre"
                      className={`relative cursor-pointer flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-black transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 ${
                        viewMode === "list"
                          ? "text-white"
                          : "text-black hover:bg-neutral-100"
                      }`}
                    >
                      <List className="w-3.5 h-3.5 stroke-[2.5]" />
                      Lista
                    </button>
                    <button
                      type="button"
                      onClick={() => switchViewMode("map")}
                      aria-pressed={viewMode === "map"}
                      title="Visualização em mapa de cadeias de pré-requisitos"
                      className={`relative cursor-pointer flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-black transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 ${
                        viewMode === "map"
                          ? "text-white"
                          : "text-black hover:bg-neutral-100"
                      }`}
                    >
                      <Network className="w-3.5 h-3.5 stroke-[2.5]" />
                      Mapa
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-bold pt-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveFilter("all")}
                    aria-pressed={activeFilter === "all"}
                    className={
                      activeFilter === "all"
                        ? "bg-ink-deep text-white hover:bg-filter-hover dark:bg-slate-50 dark:text-ink dark:hover:bg-slate-200"
                        : "hover:bg-paper"
                    }
                  >
                    Todas (
                    {flowchartData?.metrics.totalMandatoryDisciplines || 0})
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveFilter("pending_mandatory")}
                    aria-pressed={activeFilter === "pending_mandatory"}
                    className={
                      activeFilter === "pending_mandatory"
                        ? "gap-1 bg-ink-deep text-white hover:bg-filter-hover dark:bg-slate-50 dark:text-ink dark:hover:bg-slate-200"
                        : "gap-1"
                    }
                    title="Disciplinas obrigatórias que ainda faltam concluir"
                  >
                    <BookOpen className="w-3.5 h-3.5 stroke-[2.5]" />
                    Faltam Cursar (
                    {Math.max(
                      0,
                      (flowchartData?.metrics.totalMandatoryDisciplines || 0) -
                        (flowchartData?.metrics.completedMandatoryDisciplines ||
                          0),
                    )}
                    )
                  </Button>

                  <Button
                    type="button"
                    variant={
                      activeFilter === "completed" ? "accent" : "outline"
                    }
                    size="sm"
                    onClick={() => setActiveFilter("completed")}
                    aria-pressed={activeFilter === "completed"}
                    className={
                      activeFilter === "completed"
                        ? "gap-1"
                        : "gap-1 bg-pastel-green text-black dark:text-neo-green hover:bg-pastel-green"
                    }
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    Concluídas (
                    {flowchartData?.metrics.completedMandatoryDisciplines || 0})
                  </Button>

                  <Button
                    type="button"
                    variant={
                      activeFilter === "in_progress" ? "primary" : "outline"
                    }
                    size="sm"
                    onClick={() => setActiveFilter("in_progress")}
                    aria-pressed={activeFilter === "in_progress"}
                    className={
                      activeFilter === "in_progress"
                        ? "gap-1"
                        : "gap-1 bg-pastel-blue text-black dark:text-blue-ink hover:bg-pastel-blue"
                    }
                    title="Disciplinas que você está matriculado neste semestre"
                  >
                    <CircleDotDashed className="w-3.5 h-3.5 stroke-[2.5]" />
                    Cursando ({flowchartData?.metrics.inProgressCount || 0})
                  </Button>

                  <Button
                    type="button"
                    variant={
                      activeFilter === "available" ? "yellow" : "outline"
                    }
                    size="sm"
                    onClick={() => setActiveFilter("available")}
                    aria-pressed={activeFilter === "available"}
                    className={
                      activeFilter === "available"
                        ? "gap-1"
                        : "gap-1 bg-pastel-yellow text-black dark:text-neo-yellow hover:bg-neo-yellow/40"
                    }
                    title="Disciplinas liberadas para matrícula (pré-requisitos cumpridos)"
                  >
                    <Unlock className="w-3.5 h-3.5 stroke-[2.5]" />
                    Disponíveis ({flowchartData?.metrics.availableCount || 0})
                  </Button>
                </div>
              </div>
              {viewMode === "list" ? (
                <FlowchartList
                  semesters={flowchartData.semesters}
                  visibleCodes={filteredCodesSet}
                  disciplineNames={disciplineNames}
                  onToggle={toggleDiscipline}
                  onSendToGrade={(code, name) =>
                    sendDisciplineToGradeAction(container, code, name)
                  }
                />
              ) : (
                <FlowchartDiagram
                  flowchartData={flowchartData}
                  visibleCodes={filteredCodesSet}
                  onToggle={toggleDiscipline}
                  onSendToGrade={(code, name) =>
                    sendDisciplineToGradeAction(container, code, name)
                  }
                />
              )}
            </section>
          )}

          {(flowchartData?.electiveCompletedDisciplines?.length || 0) > 0 && (
            <div className="mt-8 bg-paper border-2 border-ink rounded-xl p-5 shadow-neo">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-black stroke-[2.5]" />
                <h3 className="font-black text-sm text-black">
                  Optativas & Componentes Fora da Grade Obrigatória (
                  {flowchartData?.electiveCompletedDisciplines.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {flowchartData?.electiveCompletedDisciplines.map((d) => (
                  <div
                    key={d.code}
                    className="bg-neutral-50 border-2 border-ink rounded-lg p-2.5 shadow-neo-sm flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[11px] font-black bg-paper px-1.5 py-0.5 border border-ink rounded">
                          {d.code}
                        </span>
                        {d.workloadHours && (
                          <span className="text-[11px] font-bold text-neutral-600">
                            {d.workloadHours}h
                          </span>
                        )}
                      </div>
                      <p
                        className="text-xs font-black truncate text-black"
                        title={d.name}
                      >
                        {d.name}
                      </p>
                    </div>

                    <span className="text-[11px] font-black px-1.5 py-0.5 bg-neo-green text-ink border border-ink rounded-md shrink-0">
                      {d.grade || "AP"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      </ErrorBoundary>

      <CurriculumSelectorDialog
        isOpen={isCurriculumDialogOpen}
        onClose={() => setIsCurriculumDialogOpen(false)}
        curricula={courseCurricula}
        currentCurriculumId={curriculum?.id}
        currentCurriculumCode={curriculum?.code || profile?.curriculumCode}
        initialCourseName={profile?.courseName}
        onSelect={selectCurriculum}
      />
    </PageContainer>
  );
};
