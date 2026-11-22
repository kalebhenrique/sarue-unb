import React, { useState, useMemo, Suspense } from "react";
import { useMyCourse } from "../hooks/useMyCourse";
import {
  FlowchartStats,
  FlowchartList,
  CurrentlyEnrolledPanel,
  CurriculumSelectorDialog,
  MyCourseSkeleton,
} from "../components/course";
import { IraCalculatorScreen } from "./IraCalculatorScreen";
import { CurriculumEditorScreen } from "./CurriculumEditorScreen";
import { useContainer } from "../context/ContainerContext";

const FlowchartDiagramLazy = React.lazy(() =>
  import("../components/course/FlowchartDiagram").then((m) => ({
    default: m.FlowchartDiagram,
  }))
);
import { sendDisciplineToGradeAction } from "../hooks/useGrade";
import {
  PageContainer,
  PageHeader,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HeaderIconButton,
  Input,
  EmptyState,
  ErrorBoundary,
  Badge,
  Alert,
  BottomSheet,
} from "@/components/ui";
import {
  GraduationCap,
  SlidersHorizontal,
  ArrowLeftRight,
  RotateCcw,
  Search,
  CheckCircle2,
  Unlock,
  BookOpen,
  List,
  Network,
  CircleDotDashed,
  MoreVertical,
  X,
} from "lucide-react";

type FilterType =
  "all" | "pending_mandatory" | "completed" | "in_progress" | "available";
type ViewMode = "list" | "map";

// Modo de visualização persiste durante a sessão: voltar de outra aba não reseta
let cachedViewMode: ViewMode = "list";

export interface MyCourseScreenProps {
  /** Navega para a aba de Configurações (estados vazios ganham porta de saída). */
  onOpenSettings?: () => void;
}

export const MyCourseScreen: React.FC<MyCourseScreenProps> = ({ onOpenSettings }) => {
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
    resetToNativeCurriculum,
    isAlternativeCurriculum,
    loadAllCurricula,
    reload,
  } = useMyCourse();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const mobileSearchInputRef = React.useRef<HTMLInputElement>(null);
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


  if (view === "ira-calculator") {
    return (
      <ErrorBoundary
        key="ira-calculator"
        fallbackTitle="Não foi possível abrir a Calculadora de IRA"
        fallbackDescription="Ocorreu um erro inesperado ao carregar o cenário. Seus dados estão preservados."
        onReset={() => setView("overview")}
      >
        <IraCalculatorScreen onBack={() => setView("overview")} onOpenSettings={onOpenSettings} />
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

  const overrideCount =
    (profile?.manualCompletedCodes?.length || 0) +
    (profile?.manualUncompletedCodes?.length || 0);

  return (
    <PageContainer>
      <PageHeader
        title="Meu Curso"
        icon={GraduationCap}
        mobileActions={
          profile ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <HeaderIconButton
                    aria-label="Mais ações do curso"
                    hasActiveIndicator={overrideCount > 0}
                  >
                    <MoreVertical className="w-4 h-4 stroke-[2.5]" />
                  </HeaderIconButton>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setView("curriculum-editor")}
                >
                  <BookOpen className="w-4 h-4 stroke-[2.5]" />
                  Gerenciar Currículo
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsCurriculumDialogOpen(true)}
                >
                  <ArrowLeftRight className="w-4 h-4 stroke-[2.5]" />
                  Trocar Matriz / Curso
                </DropdownMenuItem>
                {overrideCount > 0 ? (
                  <DropdownMenuItem onClick={resetOverrides}>
                    <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                    Resetar ({overrideCount} alterações)
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {overrideCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetOverrides}
                className="text-xs shrink-0"
                title="Restaurar o estado original vindo do histórico"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                Resetar ({overrideCount} alterações)
              </Button>
            )}

            {profile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView("curriculum-editor")}
                title="Editar disciplinas, inserir optativas ou customizar o currículo"
              >
                <BookOpen className="w-4 h-4 stroke-[2.5]" />
                Gerenciar Currículo
              </Button>
            )}

            {profile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCurriculumDialogOpen(true)}
                title="Trocar ou simular outra matriz ou curso da UnB"
              >
                <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
                Trocar Matriz / Curso
              </Button>
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
                carregar seu histórico automaticamente, ou escolha manualmente um
                curso da UnB abaixo para explorar o fluxograma offline.
              </>
            }
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCurriculumDialogOpen(true)}
              >
                <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
                Escolher Curso Manualmente
              </Button>
            }
            className="mb-6"
          />
        ) : (
          <>
            {isAlternativeCurriculum && flowchartData && (
              <Alert
                variant="yellow"
                title={`Simulando: ${curriculum?.courseName} (${curriculum?.code})`}
                description={
                  <>
                    Seu curso oficial no SIGAA é{" "}
                    <strong>
                      {flowchartData.metrics.nativeCourseName ||
                        profile?.courseName}
                    </strong>{" "}
                    (
                    {flowchartData.metrics.nativeCurriculumCode ||
                      profile?.curriculumCode}
                    ). Os índices abaixo refletem o aproveitamento estimado
                    nesta grade.
                  </>
                }
                aside={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetToNativeCurriculum}
                    title="Restaurar visualização da matriz oficial registrada no SIGAA"
                    className="dark:bg-neo-yellow dark:text-ink dark:hover:bg-neo-yellowHover"
                  >
                    <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                    Restaurar Curso Oficial (
                    {flowchartData.metrics.nativeCurriculumCode ||
                      profile?.curriculumCode}
                    )
                  </Button>
                }
                className="mb-6"
              />
            )}

            <div className="bg-paper border-2 border-ink rounded-lg p-3.5 md:p-5 mb-3 md:mb-6 shadow-neo-sm md:shadow-neo">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-lg font-black text-black tracking-tight">
                    {curriculum?.courseName ||
                      profile.courseName ||
                      "Curso de Graduação"}
                  </span>
                  {curriculum?.code && (
                    <Badge
                      variant="neutral"
                      size="sm"
                      title={`Matriz ${curriculum.code}`}
                    >
                      {curriculum.code}
                    </Badge>
                  )}
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

          {flowchartData && (() => {
            const totalMandatory =
              flowchartData.metrics.totalMandatoryDisciplines || 0;
            const completedMandatory =
              flowchartData.metrics.completedMandatoryDisciplines || 0;
            const statusFilterOptions: Array<{
              value: FilterType;
              label: string;
              count: number;
              icon?: React.ComponentType<{ className?: string }>;
              title?: string;
              activeVariant: "outline" | "accent" | "primary" | "yellow";
              activeClass: string;
              inactiveClass: string;
            }> = [
              {
                value: "all",
                label: "Todas",
                count: totalMandatory,
                activeVariant: "outline",
                activeClass:
                  "bg-ink-deep text-white hover:bg-filter-hover dark:bg-slate-50 dark:text-ink dark:hover:bg-slate-200",
                inactiveClass: "hover:bg-paper",
              },
              {
                value: "pending_mandatory",
                label: "Faltam Cursar",
                count: Math.max(0, totalMandatory - completedMandatory),
                icon: BookOpen,
                title: "Disciplinas obrigatórias que ainda faltam concluir",
                activeVariant: "outline",
                activeClass:
                  "gap-1 bg-ink-deep text-white hover:bg-filter-hover dark:bg-slate-50 dark:text-ink dark:hover:bg-slate-200",
                inactiveClass: "gap-1",
              },
              {
                value: "completed",
                label: "Concluídas",
                count: completedMandatory,
                icon: CheckCircle2,
                activeVariant: "accent",
                activeClass: "gap-1",
                inactiveClass:
                  "gap-1 bg-pastel-green text-black dark:text-neo-green hover:bg-pastel-green",
              },
              {
                value: "in_progress",
                label: "Cursando",
                count: flowchartData.metrics.inProgressCount || 0,
                icon: CircleDotDashed,
                title: "Disciplinas que você está matriculado neste semestre",
                activeVariant: "primary",
                activeClass: "gap-1",
                inactiveClass:
                  "gap-1 bg-pastel-blue text-black dark:text-blue-ink hover:bg-pastel-blue",
              },
              {
                value: "available",
                label: "Disponíveis",
                count: flowchartData.metrics.availableCount || 0,
                icon: Unlock,
                title:
                  "Disciplinas liberadas para matrícula (pré-requisitos cumpridos)",
                activeVariant: "yellow",
                activeClass: "gap-1",
                inactiveClass:
                  "gap-1 bg-pastel-yellow text-black dark:text-neo-yellow hover:bg-neo-yellow/40",
              },
            ];
            const hasActiveSheetFilter = activeFilter !== "all";

            return (
              <>
                {/* Mobile: busca solta + botão de filtros abrindo BottomSheet (padrão Início) */}
                <div className="md:hidden mb-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 stroke-[2.5]" />
                      <input
                        ref={mobileSearchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por código ou nome..."
                        aria-label="Buscar disciplina por código ou nome"
                        className={`w-full h-10 pl-9 text-sm font-medium text-black border-2 border-ink rounded-xl focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[background-color,border-color] placeholder:text-neutral-500 shadow-neo-sm ${
                          searchQuery.trim()
                            ? "bg-pastel-blue pr-9"
                            : "bg-paper pr-3"
                        }`}
                      />
                      {searchQuery.trim() ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            mobileSearchInputRef.current?.focus();
                          }}
                          aria-label="Limpar busca"
                          className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-500 hover:text-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
                        >
                          <X className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      ) : null}
                    </div>

                    <HeaderIconButton
                      aria-label="Filtrar disciplinas"
                      hasActiveIndicator={hasActiveSheetFilter}
                      active={filterSheetOpen || hasActiveSheetFilter}
                      onClick={() => setFilterSheetOpen(true)}
                    >
                      <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
                    </HeaderIconButton>
                  </div>
                </div>

                {/* BottomSheet mobile de filtros (padrão FeedToolbar / Início) */}
                <BottomSheet
                  open={filterSheetOpen}
                  onClose={() => setFilterSheetOpen(false)}
                  role="dialog"
                  aria-label="Filtros das disciplinas"
                  backdrop
                  backdropClassName="z-40 md:hidden"
                  className="fixed inset-x-0 bottom-0 w-full z-50 md:hidden"
                  portal
                  dragOnlyOnHandle
                >
                  <div className="px-4 max-h-[calc(85dvh-2rem)] overflow-y-auto overflow-x-hidden pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                    <div className="flex items-center justify-between gap-2 pb-3 border-b-2 border-ink/10">
                      <h2 className="text-base font-extrabold tracking-tight text-black">
                        Filtros
                      </h2>
                      {hasActiveSheetFilter ? (
                        <button
                          type="button"
                          onClick={() => setActiveFilter("all")}
                          className="cursor-pointer text-xs font-bold text-neutral-600 underline hover:text-black"
                        >
                          Limpar filtros
                        </button>
                      ) : null}
                    </div>

                    <div className="space-y-4 pt-3 pb-2">
                      <div className="space-y-2">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-neutral-600">
                          Situação
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {statusFilterOptions.map((opt) => {
                            const selected = activeFilter === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setActiveFilter(opt.value)}
                                className={`cursor-pointer px-3 py-2 text-xs font-bold rounded-lg border-2 border-ink transition-colors ${
                                  selected
                                    ? "bg-neo-blue text-white"
                                    : "bg-paper text-black hover:bg-neutral-100"
                                }`}
                              >
                                {opt.label} ({opt.count})
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </BottomSheet>

                <section
                  className="bg-paper border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo"
                  aria-label={
                    viewMode === "list"
                      ? "Fluxograma de disciplinas por semestre"
                      : "Mapa de cadeias de pré-requisitos"
                  }
                >
                  <div className="p-3 md:p-4 border-b-2 border-ink md:space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="hidden md:block relative flex-1 min-w-0">
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
                        className="relative grid grid-cols-2 gap-0.5 p-0.5 bg-paper border-2 border-ink rounded-xl w-full md:w-auto md:shrink-0"
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

                    <div className="hidden md:flex md:flex-wrap items-center gap-2 text-xs font-bold pt-0.5">
                      {statusFilterOptions.map((opt) => {
                        const isActive = activeFilter === opt.value;
                        const Icon = opt.icon;
                        return (
                          <Button
                            key={opt.value}
                            type="button"
                            variant={isActive ? opt.activeVariant : "outline"}
                            size="sm"
                            onClick={() => setActiveFilter(opt.value)}
                            aria-pressed={isActive}
                            title={opt.title}
                            className={`shrink-0 whitespace-nowrap ${
                              isActive ? opt.activeClass : opt.inactiveClass
                            }`}
                          >
                            {Icon ? (
                              <Icon className="w-3.5 h-3.5 stroke-[2.5]" />
                            ) : null}
                            {opt.label} ({opt.count})
                          </Button>
                        );
                      })}
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
                    <Suspense
                      fallback={
                        <div className="h-[560px] w-full bg-canvas flex items-center justify-center">
                          <span className="text-xs font-bold text-neutral-600">
                            Carregando mapa...
                          </span>
                        </div>
                      }
                    >
                      <FlowchartDiagramLazy
                        flowchartData={flowchartData}
                        visibleCodes={filteredCodesSet}
                        onToggle={toggleDiscipline}
                        onSendToGrade={(code, name) =>
                          sendDisciplineToGradeAction(container, code, name)
                        }
                      />
                    </Suspense>
                  )}
                </section>
              </>
            );
          })()}

          {(flowchartData?.electiveCompletedDisciplines?.length || 0) > 0 && (
            <div className="mt-8 bg-paper border-2 border-ink rounded-xl p-5 shadow-neo-sm md:shadow-neo">
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
                    <div className="min-w-0 pr-2 space-y-0.5">
                      <p
                        className="text-sm font-medium leading-snug line-clamp-2 text-black"
                        title={d.name}
                      >
                        {d.name}
                      </p>
                      <span className="text-xs font-medium text-neutral-600 block truncate">
                        {d.code}
                        {d.workloadHours ? ` • ${d.workloadHours}h` : ""}
                      </span>
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
        curricula={allCurricula}
        currentCurriculumId={curriculum?.id}
        currentCurriculumCode={curriculum?.code || profile?.curriculumCode}
        initialCourseName={curriculum?.courseName || profile?.courseName}
        onSelect={selectCurriculum}
        onLoadAllCurricula={loadAllCurricula}
      />
    </PageContainer>
  );
};
