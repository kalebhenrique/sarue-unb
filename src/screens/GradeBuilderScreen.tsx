import React, { useState, useRef, useMemo } from "react";
import { useGrade } from "../hooks/useGrade";
import {
  PageContainer,
  PageHeader,
  toast,
  Alert,
  BottomSheet,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FloatingActionButton,
  HeaderIconButton,
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
  Calendar,
  MoreVertical,
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { isMobileDevice } from "@/lib/platform";
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
  const isMobile = useMediaQuery("(max-width: 767px)");
  // Bottom sheets mobile: Grade Horária montada + Prazos acadêmicos
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [deadlinesSheetOpen, setDeadlinesSheetOpen] = useState(false);

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
  // No mobile, abre a folha nativa de compartilhamento (Share Sheet); no desktop, baixa o PNG.
  const handleDownloadPng = async () => {
    const node = scheduleGridRef.current;
    if (!node) return;
    let exportHost: HTMLDivElement | null = null;
    try {
      setIsExportingPng(true);

      const gridEl = node.querySelector<HTMLElement>("[data-timetable-grid]");
      const exportWidth = Math.max(
        760,
        node.clientWidth,
        (gridEl?.scrollWidth ?? 0) + 48,
      );

      const isDark = document.documentElement.classList.contains("dark");
      const exportBg = isDark ? "#111622" : "#FFFFFF";

      // Monta um estágio fora da viewport (exportHost) contendo um wrapper estático
      // (exportInner) na largura desktop completa: como passamos exportInner — e não
      // exportHost — para toPng, o clone NÃO herda `left: -99999px` dentro do SVG
      // foreignObject, evitando imagem sólida em branco.
      exportHost = document.createElement("div");
      exportHost.style.position = "fixed";
      exportHost.style.left = "-99999px";
      exportHost.style.top = "0";
      exportHost.style.margin = "0";
      exportHost.style.padding = "0";
      exportHost.style.pointerEvents = "none";

      const exportInner = document.createElement("div");
      exportInner.style.position = "static";
      exportInner.style.width = `${exportWidth}px`;
      exportInner.style.margin = "0";
      exportInner.style.padding = "12px";
      exportInner.style.backgroundColor = exportBg;
      exportInner.style.boxSizing = "border-box";

      const exportClone = node.cloneNode(true) as HTMLElement;
      exportClone.style.width = "100%";
      exportClone.style.maxWidth = "none";
      exportClone.style.boxShadow = "none";
      exportClone.querySelectorAll(".no-export").forEach((el) => el.remove());
      exportClone.querySelectorAll<HTMLElement>(".export-only").forEach((el) => {
        el.classList.remove("hidden");
        el.style.display = "inline-block";
      });

      const cloneGrid = exportClone.querySelector<HTMLElement>(
        "[data-timetable-grid]",
      );
      if (cloneGrid) {
        cloneGrid.style.width = "100%";
        const scrollWrap = cloneGrid.parentElement;
        if (scrollWrap) {
          scrollWrap.style.overflow = "visible";
          scrollWrap.style.marginLeft = "0";
          scrollWrap.style.marginRight = "0";
          scrollWrap.style.paddingLeft = "0";
          scrollWrap.style.paddingRight = "0";
        }
      }

      exportInner.appendChild(exportClone);
      exportHost.appendChild(exportInner);
      document.body.appendChild(exportHost);

      // Converte imagens (ex.: /sarue-logo.png) em data URL direto dos pixels já
      // decodificados para não depender de fetch/cacheBust no WebView do Android.
      const origImgs = Array.from(node.querySelectorAll("img"));
      const cloneImgs = Array.from(exportClone.querySelectorAll("img"));
      await Promise.all(
        cloneImgs.map(async (cloneImg, idx) => {
          const origImg = origImgs[idx];
          const src = origImg?.src || cloneImg.getAttribute("src") || "";
          if (!src || src.startsWith("data:")) return;

          let imgDataUrl: string | null = null;
          if (origImg && origImg.complete && origImg.naturalWidth > 0) {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = origImg.naturalWidth;
              canvas.height = origImg.naturalHeight;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(origImg, 0, 0);
                imgDataUrl = canvas.toDataURL("image/png");
              }
            } catch {
              imgDataUrl = null;
            }
          }

          if (!imgDataUrl) {
            try {
              const res = await fetch(src);
              if (res.ok) {
                const blob = await res.blob();
                imgDataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () =>
                    resolve(String(reader.result || ""));
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
              }
            } catch {
              imgDataUrl = null;
            }
          }

          if (imgDataUrl) {
            cloneImg.removeAttribute("srcset");
            cloneImg.src = imgDataUrl;
            if (typeof cloneImg.decode === "function") {
              await cloneImg.decode().catch(() => {});
            }
          }
        }),
      );

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const dataUrl = await toPng(exportInner, {
        pixelRatio: 2,
        // A exportação segue o tema ativo: base de corte escura exporta fundo escuro.
        backgroundColor: exportBg,
      });

      exportHost.remove();
      exportHost = null;

      const filename = `grade-unb-${year}-${period}.png`;
      const shareTitle = `Grade Horária ${year}.${period} • UnB`;

      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { commands } = await import("@/core/infrastructure/bindings");
        const res = await commands.shareImage(dataUrl, filename, shareTitle);
        if (res.status === "error") {
          throw new Error(res.error);
        }
        // `true` = compartilhado nativamente no mobile; `false` = fallback desktop (download)
        if (res.data) {
          return;
        }
      } else if (isMobileDevice() && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], filename, { type: "image/png" });
        if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: shareTitle });
          return;
        }
      }

      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      toast.add({
        title: "Exportação da grade",
        description: "Não foi possível gerar ou compartilhar a imagem. Tente novamente.",
        type: "error",
      });
    } finally {
      exportHost?.remove();
      setIsExportingPng(false);
    }
  };

  const renderScheduleContent = (inSheet: boolean) => (
    <>
      {conflicts.length > 0 && selectedClasses.length > 0 ? (
        <Alert
          variant="destructive"
          icon={AlertTriangle}
          className={inSheet ? "shadow-none!" : undefined}
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
                Remova uma das turmas conflitantes ou gere combinações para
                resolver.
              </p>
            </div>
          }
          aside={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={inSheet ? "shadow-none!" : undefined}
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
          inSheet={inSheet}
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
                className={inSheet ? "shadow-none!" : undefined}
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
        inSheet={inSheet}
      />
    </>
  );

  return (
    <PageContainer>
      {/* Título Padronizado da Página com Ícone da Sidebar */}
      <PageHeader
        icon={SquareKanban}
        title="Montar Grade Horária"
        count={selectedClasses.length > 0 ? selectedClasses.length : null}
        mobileActions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <HeaderIconButton
                  aria-label="Mais ações da grade horária"
                  hasActiveIndicator={conflicts.length > 0}
                >
                  <MoreVertical className="w-4 h-4 stroke-[2.5]" />
                </HeaderIconButton>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setNewPlanningOpen(true)}>
                <PlusCircle className="w-4 h-4 stroke-[2.5]" />
                Novo planejamento
              </DropdownMenuItem>
              {!isCurrentSemesterMode && currentEnrolledClasses.length > 0 ? (
                <DropdownMenuItem onClick={restoreEnrolledClasses}>
                  <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                  Restaurar matriculadas ({enrolledCount})
                </DropdownMenuItem>
              ) : null}
              {hasSemesterAlert ? (
                <DropdownMenuItem onClick={() => setDeadlinesSheetOpen(true)}>
                  <Info className="w-4 h-4 stroke-[2.5]" />
                  Prazos acadêmicos • {year}.{period}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Barra de status compacta em 1 linha no mobile + Alert completo no desktop */}
      {hasSemesterAlert && (
        <>
          <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2 bg-pastel-yellow dark:bg-paper border-2 border-ink dark:border-l-[6px] dark:border-l-neo-yellow rounded-lg text-xs font-extrabold text-black">
            <span className="min-w-0 truncate">
              Semestre {year}.{period} em andamento
              {daysLeftInSemester !== null
                ? ` (${daysLeftInSemester} ${daysLeftInSemester === 1 ? "dia" : "dias"})`
                : ""}
            </span>
            <button
              type="button"
              onClick={() => setDeadlinesSheetOpen(true)}
              aria-label="Ver prazos acadêmicos"
              className="cursor-pointer shrink-0 inline-flex items-center gap-1 underline font-black hover:text-blue-ink"
            >
              <Info className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Prazos</span>
            </button>
          </div>

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
            className="hidden md:flex mb-4"
          />
        </>
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
        hasSearched={hasSearched}
        resultCount={filteredDisciplines.length}
        onResetSearch={resetSearch}
      />

      {/* Grid Principal: filtros acima; catálogo à esquerda (5/12) e resultado à direita (7/12) a partir de lg */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: montar a grade (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
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
            onSearchAllUnb={() => executeSearch(activeSearchQuery, "ALL")}
          />

          <div className="hidden md:block">
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
          </div>
        </div>

        {/* Coluna Direita (Desktop/Tablet): Grade Horária montada */}
        {!isMobile ? (
          <div className="lg:col-span-7 space-y-4 sticky top-6">
            {renderScheduleContent(false)}
          </div>
        ) : null}
      </div>

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
              atual. Suas turmas matriculadas continuam salvas no Meu Curso —
              dá para restaurá-las depois neste banner.
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

      {/* Bottom Sheet de Prazos Acadêmicos no mobile */}
      <BottomSheet
        open={deadlinesSheetOpen}
        onClose={() => setDeadlinesSheetOpen(false)}
        role="dialog"
        aria-label="Prazos acadêmicos"
        backdrop
        backdropClassName="z-40 md:hidden"
        className="fixed inset-x-0 bottom-0 w-full z-50 md:hidden"
        portal
        dragOnlyOnHandle
      >
        <div className="px-4 max-h-[calc(85dvh-2rem)] overflow-y-auto overflow-x-hidden pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b-2 border-ink/10">
            <Info className="w-5 h-5 text-blue-ink stroke-[2.5] shrink-0" />
            <h2 className="text-base font-black text-black">
              Prazos acadêmicos • {year}.{period}
            </h2>
          </div>
          <p className="text-xs font-semibold text-neutral-700">
            {isCurrentSemesterMode
              ? "Suas turmas matriculadas estão carregadas na grade."
              : "Restaure suas turmas matriculadas ou comece um novo planejamento."}
            {daysLeftInSemester !== null
              ? ` Restam ${daysLeftInSemester} ${daysLeftInSemester === 1 ? "dia" : "dias"} para o fim do semestre.`
              : ""}
          </p>
          <ul className="space-y-1.5 text-xs font-medium text-neutral-700 list-disc pl-4">
            {calendar?.periodoAulas ? (
              <li>Aulas: {calendar.periodoAulas.raw}</li>
            ) : null}
            {calendar?.periodoRetirada ? (
              <li>Retirada: {calendar.periodoRetirada.raw}</li>
            ) : null}
            {calendar?.periodoTrancamentoParcial ? (
              <li>
                Trancamento parcial: {calendar.periodoTrancamentoParcial.raw}
              </li>
            ) : null}
            {calendar?.periodoTrancamentoGeral ? (
              <li>
                Trancamento geral: {calendar.periodoTrancamentoGeral.raw}
              </li>
            ) : null}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            {!isCurrentSemesterMode && currentEnrolledClasses.length > 0 ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  restoreEnrolledClasses();
                  setDeadlinesSheetOpen(false);
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                Restaurar matriculadas ({enrolledCount})
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDeadlinesSheetOpen(false);
                setNewPlanningOpen(true);
              }}
            >
              <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
              Novo planejamento
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Bottom Sheet da Grade Horária montada no mobile */}
      {isMobile ? (
        <BottomSheet
          open={scheduleSheetOpen}
          onClose={() => setScheduleSheetOpen(false)}
          role="dialog"
          aria-label="Grade horária montada"
          backdrop
          backdropClassName="z-40 md:hidden"
          className="fixed inset-x-0 bottom-0 w-full z-50 md:hidden"
          portal
          dragOnlyOnHandle
        >
          <div className="px-4 max-h-[calc(88dvh-2rem)] overflow-y-auto overflow-x-hidden pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-ink/10">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-5 h-5 text-blue-ink stroke-[2.5] shrink-0" />
                <h2 className="text-base font-black text-black truncate">
                  Grade Horária • {year}.{period}
                </h2>
              </div>
              <span className="shrink-0 text-xs font-extrabold px-2 py-0.5 rounded-full border-2 border-ink bg-pastel-yellow text-black">
                {selectedClasses.length}{" "}
                {selectedClasses.length === 1 ? "turma" : "turmas"}
              </span>
            </div>

            {renderScheduleContent(true)}

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
              inSheet
            />
          </div>
        </BottomSheet>
      ) : null}

      {/* FAB para abrir a Grade Horária sem perder o catálogo no mobile */}
      <FloatingActionButton
        variant="primary"
        aria-label={`Visualizar grade horária (${selectedClasses.length} ${selectedClasses.length === 1 ? "turma" : "turmas"})`}
        title="Visualizar Grade Horária"
        onClick={() => setScheduleSheetOpen(true)}
        className="md:hidden"
      >
        <Calendar className="w-6 h-6 stroke-[2.5]" />
        {selectedClasses.length > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-neo-yellow text-ink border-2 border-ink text-[11px] font-black flex items-center justify-center shadow-neo-xs tabular-nums"
          >
            {selectedClasses.length}
          </span>
        ) : null}
      </FloatingActionButton>
    </PageContainer>
  );
};
