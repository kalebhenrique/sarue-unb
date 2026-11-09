import React, { useState, useRef, useMemo } from "react";
import { useGrade } from "../hooks/useGrade";
import {
  PageContainer,
  PageHeader,
  toast,
  Alert,
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  EmptyState,
} from "@/components/ui";
import {
  SquareKanban,
  RotateCcw,
  PlusCircle,
  Info,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toPng } from "html-to-image";
import type { ScrapedClass } from "@/core";
import { GradeFilters } from "../components/grade/GradeFilters";
import { SelectedClassesCard } from "../components/grade/SelectedClassesCard";
import { DisciplineCatalog } from "../components/grade/DisciplineCatalog";
import { ScheduleTimetable } from "../components/grade/ScheduleTimetable";
import { OptionNavigator } from "../components/grade/OptionNavigator";
import { DISCIPLINE_COLORS } from "../components/grade/types";

export const GradeBuilderScreen: React.FC = () => {
  const {
    departments,
    departmentsMap,
    semesters,
    selectedDeptId,
    setSelectedDeptId,
    year,
    setYear,
    period,
    setPeriod,
    filteredDisciplines,
    searchQuery,
    setSearchQuery,
    hasSearched,
    activeSearchQuery,
    activeDeptId,
    isFallbackSearch,
    isSearching,
    executeSearch,
    resetSearch,
    fetchClasses,
    selectedClasses,
    conflicts,
    scheduleOptions,
    currentOptionIndex,
    isScraping,
    isSolving,
    isSaving,
    catalogError,
    isDirty,
    toggleClass,
    removeClass,
    clearGrade,
    generateCombinations,
    applyOption,
    saveGrade,
    calendar,
    hasSemesterAlert,
    isCurrentSemesterMode,
    currentEnrolledClasses,
    enrolledCount,
    restoreEnrolledClasses,
    startNewPlanning,
  } = useGrade();

  const [expandedDisciplines, setExpandedDisciplines] = useState<
    Record<string, boolean>
  >({});
  // Preferência de turno persiste entre visitas (como ano e período persistem)
  const [shiftFilter, setShiftFilterState] = useState<"ALL" | "M" | "T" | "N">(
    () => {
      try {
        const stored = localStorage.getItem("sarue_grade_shift");
        return stored === "M" || stored === "T" || stored === "N"
          ? (stored as "M" | "T" | "N")
          : "ALL";
      } catch {
        return "ALL";
      }
    },
  );

  const setShiftFilter = (shift: "ALL" | "M" | "T" | "N") => {
    setShiftFilterState(shift);
    try {
      localStorage.setItem("sarue_grade_shift", shift);
    } catch {
      // localStorage indisponível: preferência vive só nesta sessão
    }
  };

  const [isExportingPng, setIsExportingPng] = useState(false);
  const scheduleGridRef = useRef<HTMLDivElement>(null);

  // Beco sem saída do solver: estado persistente com próximo passo, não só toast
  const [solverEmpty, setSolverEmpty] = useState(false);
  const lastSolveSignatureRef = useRef("");
  // Diálogo de confirmação do "Novo planejamento"
  const [newPlanningOpen, setNewPlanningOpen] = useState(false);

  // Roda o solver com a preferência atual e registra o estado de "nenhuma opção"
  const runSolver = async (shift: "ALL" | "M" | "T" | "N") => {
    lastSolveSignatureRef.current = selectedClasses
      .map((c) => c.id)
      .sort()
      .join("|");
    const n = await generateCombinations(shift === "ALL" ? undefined : shift);
    setSolverEmpty(n === 0);
  };

  // Limpa o beco sem saída quando o usuário mexe na grade após o solver falhar
  React.useEffect(() => {
    if (!solverEmpty) return;
    const sig = selectedClasses.map((c) => c.id).sort().join("|");
    if (sig !== lastSolveSignatureRef.current) setSolverEmpty(false);
  }, [selectedClasses, solverEmpty]);

  const toggleExpand = React.useCallback((code: string) => {
    setExpandedDisciplines((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  }, []);

  // Mapeia disciplinas para cores distintas no grid
  const disciplineColorMap = useMemo(() => {
    const map = new Map<string, (typeof DISCIPLINE_COLORS)[0]>();
    const uniqueCodes = Array.from(
      new Set(selectedClasses.map((c) => c.disciplineCode)),
    );
    uniqueCodes.forEach((code, index) => {
      map.set(code, DISCIPLINE_COLORS[index % DISCIPLINE_COLORS.length]);
    });
    return map;
  }, [selectedClasses]);

  // Monta mapa de ocupação por slot: `dia-globalIndex` -> ScrapedClass[]
  const slotOccupancy = useMemo(() => {
    const map = new Map<string, ScrapedClass[]>();
    for (const c of selectedClasses) {
      for (const slot of c.scheduleSlots) {
        const key = `${slot.day}-${slot.globalSlotIndex}`;
        const existing = map.get(key) || [];
        existing.push(c);
        map.set(key, existing);
      }
    }
    return map;
  }, [selectedClasses]);

  // Contagem regressiva até o último dia letivo do semestre (calendário acadêmico)
  const daysLeftInSemester = useMemo(() => {
    const fim = calendar?.periodoLetivo?.fim;
    if (!fim) return null;

    // Parse "YYYY-MM-DD" como data local — evita off-by-one de timezone (UTC)
    const [fy, fm, fd] = fim.split("-").map(Number);
    const fimDate = new Date(fy, fm - 1, fd);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((fimDate.getTime() - today.getTime()) / 86_400_000);

    // Semestre acabou → sem contador
    return days < 0 ? null : days;
  }, [calendar]);


  // Exportar grade horária para imagem PNG em alta resolução (2x retina)
  const handleDownloadPng = async () => {
    if (!scheduleGridRef.current) return;
    try {
      setIsExportingPng(true);
      const dataUrl = await toPng(scheduleGridRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        // A exportação segue o tema ativo: base de corte escura exporta fundo escuro.
        backgroundColor: document.documentElement.classList.contains("dark")
          ? "#111622"
          : "#FFFFFF",
        filter: (node) => {
          if (
            node instanceof HTMLElement &&
            node.classList.contains("no-export")
          ) {
            return false;
          }
          return true;
        },
      });

      const link = document.createElement("a");
      link.download = `grade-unb-${year}-${period}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.add({
        title: "Exportação da grade",
        description: "Não foi possível gerar a imagem. Tente novamente.",
        type: "error",
      });
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <PageContainer>
      {/* Título Padronizado da Página com Ícone da Sidebar */}
      <PageHeader icon={SquareKanban} title="Montar Grade Horária" />

      {/* Alerta de Semestre em Andamento para contas com Meu Curso ativado */}
      {hasSemesterAlert && (
        <Alert
          variant="yellow"
          title={`Semestre ${year}.${period} em andamento`}
          description={
            <div className="space-y-2.5 mt-1">
              {/* Frase única; prazos acadêmicos sob demanda no tooltip do ícone */}
              <p className="flex flex-wrap items-center gap-1.5">
                <span>
                  {isCurrentSemesterMode
                    ? "Suas turmas matriculadas estão na grade."
                    : "Restaure suas turmas matriculadas ou comece um novo planejamento."}
                </span>
                <Tooltip>
                  <TooltipTrigger
                    aria-label="Prazos acadêmicos deste semestre"
                    className="inline-flex h-5 w-5 items-center justify-center cursor-help rounded-md text-neutral-600 hover:bg-black/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-1"
                  >
                    <Info className="w-3.5 h-3.5 stroke-[2.5]" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="start"
                    className="max-w-[300px] text-left space-y-1"
                  >
                    <p className="font-bold text-black">
                      Prazos acadêmicos • {year}.{period}
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {calendar?.periodoAulas && (
                        <li>Aulas: {calendar.periodoAulas.raw}</li>
                      )}
                      {calendar?.periodoRetirada && (
                        <li>Retirada: {calendar.periodoRetirada.raw}</li>
                      )}
                      {calendar?.periodoTrancamentoParcial && (
                        <li>
                          Trancamento parcial:{" "}
                          {calendar.periodoTrancamentoParcial.raw}
                        </li>
                      )}
                      {calendar?.periodoTrancamentoGeral && (
                        <li>
                          Trancamento geral:{" "}
                          {calendar.periodoTrancamentoGeral.raw}
                        </li>
                      )}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {!isCurrentSemesterMode &&
                  currentEnrolledClasses.length > 0 && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={restoreEnrolledClasses}
                      className="dark:bg-neo-yellow dark:text-ink dark:hover:bg-neo-yellowHover"
                    >
                      <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>
                        Restaurar turmas matriculadas ({enrolledCount})
                      </span>
                    </Button>
                  )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewPlanningOpen(true)}
                  className="dark:bg-neo-yellow dark:text-ink dark:hover:bg-neo-yellowHover"
                >
                  <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Novo planejamento</span>
                </Button>
              </div>
            </div>
          }
          aside={
            daysLeftInSemester !== null ? (
              <div className="flex flex-col items-end gap-1 text-right">
                <span className="text-5xl font-black tracking-tight leading-none text-black tabular-nums">
                  {daysLeftInSemester}
                </span>
                <span className="text-xs font-medium text-black leading-snug max-w-[10rem]">
                  {daysLeftInSemester === 1
                    ? "dia para acabar o semestre"
                    : "dias para acabar o semestre"}
                </span>
              </div>
            ) : undefined
          }
          className="mb-4"
        />
      )}

      {/* Seção de busca: parâmetros e busca de turmas */}
      <GradeFilters
        departments={departments}
        semesters={semesters}
        selectedDeptId={selectedDeptId}
        onSelectDeptId={setSelectedDeptId}
        year={year}
        onSelectYear={setYear}
        period={period}
        onSelectPeriod={setPeriod}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearch={() => executeSearch()}
        isSearching={isSearching}
        isScraping={isScraping}
        hasSearched={hasSearched}
        resultCount={filteredDisciplines.length}
      />

      {/* Grid Principal: filtros acima; catálogo à esquerda (5/12) e resultado à direita (7/12) a partir de lg */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: montar a grade (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <SelectedClassesCard
            selectedClasses={selectedClasses}
            disciplineColorMap={disciplineColorMap}
            onClearGrade={clearGrade}
            onRemoveClass={removeClass}
            shiftFilter={shiftFilter}
            onShiftFilterChange={setShiftFilter}
            onGenerateCombinations={() => runSolver(shiftFilter)}
            onSaveGrade={saveGrade}
            isSolving={isSolving}
            isSaving={isSaving}
            isDirty={isDirty}
          />

          <DisciplineCatalog
            filteredDisciplines={filteredDisciplines}
            selectedClasses={selectedClasses}
            expandedDisciplines={expandedDisciplines}
            onToggleExpand={toggleExpand}
            onToggleClass={toggleClass}
            hasSearched={hasSearched}
            activeSearchQuery={activeSearchQuery}
            activeDeptId={activeDeptId}
            isFallbackSearch={isFallbackSearch}
            isScraping={isScraping}
            catalogError={catalogError}
            onRetryCatalog={() => fetchClasses()}
            departmentsMap={departmentsMap}
            onResetSearch={resetSearch}
            onSearchAllUnb={() => executeSearch(activeSearchQuery, "ALL")}
          />
        </div>

        {/* Coluna Direita: resultado (7 colunas) */}
        <div className="lg:col-span-7 space-y-4">
          {conflicts.length > 0 && selectedClasses.length > 0 ? (
            <Alert
              variant="destructive"
              icon={AlertTriangle}
              title={`Conflito de horário (${conflicts.length})`}
              description={
                <div className="space-y-1">
                  <p>
                    {conflicts.slice(0, 2).join(" • ")}
                    {conflicts.length > 2
                      ? ` • +${conflicts.length - 2} outros`
                      : ""}
                  </p>
                  <p>
                    Remova uma das turmas conflitantes ou gere combinações
                    para resolver.
                  </p>
                </div>
              }
              aside={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => runSolver(shiftFilter)}
                >
                  Gerar combinações
                </Button>
              }
            />
          ) : null}

          {scheduleOptions.length >= 1 ? (
            <OptionNavigator
              optionsCount={scheduleOptions.length}
              currentIndex={currentOptionIndex}
              onApplyOption={applyOption}
            />
          ) : null}

          {solverEmpty && !isSolving && selectedClasses.length > 0 ? (
            <EmptyState
              title="Nenhuma combinação sem conflito"
              description={`As turmas disponíveis sempre colidem entre si. Remova uma disciplina, escolha outra turma manualmente no catálogo, ou aceite os conflitos e salve mesmo assim.`}
              action={
                shiftFilter !== "ALL" ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setShiftFilter("ALL");
                      runSolver("ALL");
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
                    Tentar sem preferência de turno
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          <ScheduleTimetable
            ref={scheduleGridRef}
            selectedClasses={selectedClasses}
            slotOccupancy={slotOccupancy}
            disciplineColorMap={disciplineColorMap}
            year={year}
            period={period}
            conflicts={conflicts}
            onDownloadPng={handleDownloadPng}
            isExportingPng={isExportingPng}
            defaultCompact={isCurrentSemesterMode}
          />

          {/* Confirmação de novo planejamento quando há turmas na grade */}
          <Dialog
            open={newPlanningOpen}
            onOpenChange={(open) => setNewPlanningOpen(open)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Começar novo planejamento?</DialogTitle>
                <DialogDescription>
                  Isso limpa as {selectedClasses.length}{" "}
                  {selectedClasses.length === 1 ? "turma" : "turmas"} da grade
                  atual. Suas turmas matriculadas continuam salvas no Meu
                  Curso — dá para restaurá-las depois neste banner.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setNewPlanningOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    startNewPlanning();
                    setNewPlanningOpen(false);
                  }}
                >
                  Limpar e planejar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </PageContainer>
  );
};
