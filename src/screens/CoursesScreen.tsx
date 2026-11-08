import React, { useState, useEffect, useMemo } from "react";
import { useFeed } from "../hooks/useFeed";
import { useContainer } from "../context/ContainerContext";
import {
  Card,
  Badge,
  Alert,
  PageContainer,
  PageHeader,
  Button,
  Pagination,
  toast,
  EmptyState,
  Skeleton,
} from "@/components/ui";
import {
  GraduationCap,
  User,
  MapPin,
  Clock,
  CheckSquare,
  MessageSquare,
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  Link2,
  Folder,
} from "lucide-react";
import { UnmatchedCourseDialog } from "../components/UnmatchedCourseDialog";
import {
  AbsenceSection,
  readAbsenceOverride,
  writeAbsenceOverride,
} from "../components/course";
import { GradeFormulaSection } from "../components/course";
import { FeedList } from "../components/feed/FeedList";
import { FeedToolbar } from "../components/feed/FeedToolbar";
import { useFeedSelection } from "../hooks/useFeedSelection";
import { getDefaultAcademicSemester, calculateAbsenceRisk } from "@/core";
import type { Course, Discipline, FeedItemType, PlatformType } from "@/core";

const PLATFORM_LABELS: Record<PlatformType, string> = {
  sigaa: "Sigaa",
  aprender3: "Aprender 3",
  teams: "Teams",
};

export const CoursesScreen: React.FC = () => {
  const {
    disciplines,
    unmatchedCourses,
    otherCourses,
    items,
    isLoading,
    hasLoadedOnce,
    toggleTaskCompleted,
    archiveFeedItem,
    showArchived,
    setShowArchived,
    associateCourse,
    completeTasksBatch,
    archiveItemsBatch,
  } = useFeed();

  const { repos } = useContainer();

  const [selectedDiscipline, setSelectedDiscipline] =
    useState<Discipline | null>(null);
  const [resolvingCourse, setResolvingCourse] = useState<Course | null>(null);
  // Ajuste manual de faltas da disciplina aberta no drill-down (null = usar valor do SIGAA).
  // Persistido em localStorage para sobreviver aos re-syncs do SIGAA.
  const [absenceOverride, setAbsenceOverride] = useState<number | null>(null);
  // Incrementa a cada ajuste para recomputar badges/notificações da lista que dependem do override
  const [absenceOverridesVersion, setAbsenceOverridesVersion] = useState(0);
  const [drillSearchQuery, setDrillSearchQuery] = useState<string>("");
  const [drillCategory, setDrillCategory] = useState<FeedItemType | "all">(
    "all",
  );
  const [drillPlatform, setDrillPlatform] = useState<PlatformType | "all">(
    "all",
  );

  // Paginação client-side do feed da disciplina: 25 por página, reset ao trocar de vista/filtro
  const DRILL_PAGE_SIZE = 25;

  const [drillPage, setDrillPage] = useState(1);
  useEffect(() => {
    setDrillPage(1);
  }, [
    selectedDiscipline,
    drillSearchQuery,
    drillCategory,
    drillPlatform,
    showArchived,
  ]);

  // Trocou de disciplina: filtro de plataforma volta para "Todas"
  useEffect(() => {
    setDrillPlatform("all");
  }, [selectedDiscipline]);

  const selectedDisciplineId = selectedDiscipline?.id;
  // Trocou de disciplina: carrega o ajuste manual de faltas da persistência
  useEffect(() => {
    setAbsenceOverride(
      selectedDisciplineId ? readAbsenceOverride(selectedDisciplineId) : null,
    );
  }, [selectedDisciplineId]);

  // Ajuste manual editado: persiste e invalida os badges/notificações da lista
  const handleAbsenceOverrideChange = (value: number | null) => {
    if (selectedDisciplineId) {
      writeAbsenceOverride(selectedDisciplineId, value);
      setAbsenceOverridesVersion((v) => v + 1);
    }
    setAbsenceOverride(value);
  };

  // Faltas efetivas de uma disciplina: ajuste manual > SIGAA > undefined
  const getEffectiveAbsences = (d: Discipline): number | undefined => {
    const overrideValue = readAbsenceOverride(d.id);
    if (overrideValue !== null) return overrideValue;
    return d.absences ?? d.sigaaCourse?.absences ?? undefined;
  };

  // Plataformas que a disciplina efetivamente tem (SIGAA / Aprender 3 / Teams)
  const drillPlatforms = useMemo(() => {
    if (!selectedDiscipline) return [];
    const platforms: PlatformType[] = [];
    if (selectedDiscipline.sigaaCourse) platforms.push("sigaa");
    if (selectedDiscipline.aprenderCourses.length > 0)
      platforms.push("aprender3");
    if (
      selectedDiscipline.teamsCourses &&
      selectedDiscipline.teamsCourses.length > 0
    )
      platforms.push("teams");
    return platforms;
  }, [selectedDiscipline]);

  const drillPlatformOptions = useMemo(
    () => [
      { value: "all" as PlatformType | "all", label: "Todas" },
      ...drillPlatforms.map((platform) => ({
        value: platform,
        label: PLATFORM_LABELS[platform],
      })),
    ],
    [drillPlatforms],
  );

  // Avaliação do risco de faltas (regra de 25% da UnB)
  const atRiskDisciplines = useMemo(() => {
    return disciplines
      .map((d) => {
        const abs = getEffectiveAbsences(d);
        if (abs === undefined) return null;
        const status = calculateAbsenceRisk({
          absences: abs,
          maxAbsences: d.maxAbsences ?? d.sigaaCourse?.maxAbsences,
          schedule: d.schedule || d.sigaaCourse?.schedule,
        });
        return { discipline: d, status };
      })
      .filter(
        (
          item,
        ): item is {
          discipline: Discipline;
          status: ReturnType<typeof calculateAbsenceRisk>;
        } => Boolean(item && (item.status.isAtRisk || item.status.isExceeded)),
      );
    // absenceOverridesVersion é dependência intencional: invalida o memo quando o ajuste
    // manual de faltas muda (o valor vem de localStorage, não observável pelo React)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disciplines, absenceOverridesVersion]);

  // Notificação do Sistema Operacional quando estiver prestes a atingir o limite de faltas (ou tiver excedido)
  useEffect(() => {
    if (!disciplines || disciplines.length === 0) return;

    const checkAbsenceNotifications = async () => {
      for (const item of atRiskDisciplines) {
        const { discipline, status } = item;
        const notifKey = `sarue:absence_notif:${discipline.id}:${status.absences}`;
        if (!localStorage.getItem(notifKey)) {
          localStorage.setItem(notifKey, new Date().toISOString());
          await repos.osNotifier.ensurePermission();

          const title = status.isExceeded
            ? `Limite de faltas excedido: ${discipline.name}`
            : status.isCritical
            ? `Alerta Crítico de Faltas: ${discipline.name}`
            : `Atenção ao limite de faltas: ${discipline.name}`;

          const body = status.isExceeded
            ? `Você possui ${status.absences}/${status.maxAbsences} faltas e ultrapassou os 25% permitidos na UnB.`
            : status.isCritical
            ? `Resta apenas 1 aula (${status.hoursPerClass}h) para reprovação por faltas na UnB!`
            : `Restam 2 aulas (${status.hoursPerClass}h cada) para atingir o limite de 25% de faltas na UnB.`;

          await repos.osNotifier.notify({ title, body });
        }
      }
    };

    checkAbsenceNotifications();
  }, [atRiskDisciplines, disciplines, repos.osNotifier]);

  // Feed da disciplina (drill-down): filtragem e paginação calculadas no topo,
  // antes dos retornos antecipados, para os hooks do modo Selecionar manterem
  // a ordem fixa exigida pelo React.
  // Itens da disciplina sem os filtros do drill-down: contagem absoluta do título
  const disciplineAllItems = useMemo(() => {
    if (!selectedDiscipline) return [];
    return items.filter((item) => {
      const belongsToDiscipline =
        item.courseName === selectedDiscipline.name ||
        (selectedDiscipline.code &&
          item.courseCode === selectedDiscipline.code) ||
        selectedDiscipline.aprenderCourses.some(
          (ac) =>
            ac.name === item.courseName ||
            (ac.code && item.courseCode === ac.code),
        ) ||
        (selectedDiscipline.teamsCourses &&
          selectedDiscipline.teamsCourses.some(
            (tc) =>
              tc.name === item.courseName ||
              (tc.code && item.courseCode === tc.code),
          ));
      return belongsToDiscipline;
    });
  }, [items, selectedDiscipline]);

  const disciplineFeedItems = useMemo(() => {
    return disciplineAllItems.filter((item) => {
      // Filtro por Plataforma
      if (drillPlatform !== "all" && item.platform !== drillPlatform) {
        return false;
      }

      // Filtro por Categoria
      if (drillCategory !== "all" && item.itemType !== drillCategory) {
        return false;
      }

      // Filtro por Busca Textual
      if (drillSearchQuery.trim().length > 0) {
        const q = drillSearchQuery.trim().toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchContent = item.content.toLowerCase().includes(q);
        const matchAuthor = item.author?.toLowerCase().includes(q) ?? false;
        if (!matchTitle && !matchContent && !matchAuthor) {
          return false;
        }
      }

      return true;
    });
  }, [disciplineAllItems, drillPlatform, drillCategory, drillSearchQuery]);

  const drillPageCount = Math.max(
    1,
    Math.ceil(disciplineFeedItems.length / DRILL_PAGE_SIZE),
  );
  const safeDrillPage = Math.min(drillPage, drillPageCount);
  const drillPageItems = disciplineFeedItems.slice(
    (safeDrillPage - 1) * DRILL_PAGE_SIZE,
    safeDrillPage * DRILL_PAGE_SIZE,
  );

  // Modo Selecionar (lote) do feed da disciplina: mesmas regras do Feed (Início)
  const drillPageIds = useMemo(
    () => drillPageItems.map((i) => i.id),
    [drillPageItems],
  );
  const selection = useFeedSelection(
    drillPageIds,
    `${selectedDiscipline?.id ?? "none"}|${drillSearchQuery}|${drillCategory}|${drillPlatform}|${showArchived}|${safeDrillPage}`,
  );
  const { isSelecting, selectedIds } = selection;
  const selectedItems = useMemo(
    () => drillPageItems.filter((i) => selectedIds.has(i.id)),
    [drillPageItems, selectedIds],
  );
  const selectedCount = selectedItems.length;
  const selectedTaskCount = selectedItems.filter(
    (i) => i.itemType === "assignment",
  ).length;
  const allSelected =
    drillPageItems.length > 0 &&
    drillPageItems.every((i) => selectedIds.has(i.id));

  const handleBatchComplete = async () => {
    const ids = selectedItems
      .filter((i) => i.itemType === "assignment")
      .map((i) => i.id);
    if (ids.length === 0) return;
    await completeTasksBatch(ids);
    const n = ids.length;
    toast.add({
      title: n === 1 ? "Tarefa concluída" : `${n} tarefas concluídas`,
      description:
        n === 1
          ? "A tarefa foi marcada como concluída."
          : "As tarefas foram marcadas como concluídas.",
      type: "success",
      timeout: 4000,
    });
  };

  const handleBatchArchive = async () => {
    const ids = selectedItems.map((i) => i.id);
    if (ids.length === 0) return;
    await archiveItemsBatch(ids, true);
    const n = ids.length;
    toast.add({
      title: n === 1 ? "Item arquivado" : `${n} itens arquivados`,
      description:
        n === 1
          ? "O item foi movido para os Arquivados."
          : "Os itens foram movidos para os Arquivados.",
      type: "info",
      timeout: 5000,
    });
    selection.clear();
  };

  const handleBatchRestore = async () => {
    const ids = selectedItems.map((i) => i.id);
    if (ids.length === 0) return;
    await archiveItemsBatch(ids, false);
    const n = ids.length;
    toast.add({
      title: n === 1 ? "Item desarquivado" : `${n} itens desarquivados`,
      description:
        n === 1
          ? "O item retornou ao feed ativo da disciplina."
          : "Os itens retornaram ao feed ativo da disciplina.",
      type: "success",
      timeout: 4000,
    });
    selection.clear();
  };

  const handleArchive = async (id: string) => {
    await archiveFeedItem(id, true);
    toast.add({
      title: "Item arquivado",
      description: "O item foi movido para os Arquivados.",
      type: "info",
      timeout: 5000,
    });
  };

  const handleRestore = async (id: string) => {
    await archiveFeedItem(id, false);
    toast.add({
      title: "Item desarquivado",
      description: "O item retornou ao feed ativo da disciplina.",
      type: "success",
      timeout: 4000,
    });
  };

  // Exibe a modal automaticamente se houver turma não associada do Aprender 3
  useEffect(() => {
    if (unmatchedCourses.length > 0 && !resolvingCourse) {
      setResolvingCourse(unmatchedCourses[0]);
    }
  }, [unmatchedCourses, resolvingCourse]);

  if (isLoading && !hasLoadedOnce && !selectedDiscipline) {
    return (
      <PageContainer>
        <PageHeader icon={GraduationCap} title="Disciplinas do Semestre" />
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          role="status"
          aria-busy="true"
        >
          <span className="sr-only">Carregando disciplinas...</span>
          {[1, 2, 3, 4].map((i) => (
            <Card
              key={i}
              className="bg-paper rounded-lg p-5 shadow-(--neo-card-shadow) flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
                <Skeleton className="h-6 w-3/4 rounded-md" />
                <div className="flex gap-3 pt-1">
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-4 w-20 rounded-md" />
                </div>
              </div>
              <div className="pt-3 border-t-2 border-ink/10 flex justify-between items-center">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  // Se o usuário selecionou uma disciplina para ver o feed exclusivo (Drill-Down)
  if (selectedDiscipline) {
    const absencesCount = getEffectiveAbsences(selectedDiscipline);
    const hasManualAbsenceOverride =
      readAbsenceOverride(selectedDiscipline.id) !== null;
    const maxAbsences =
      selectedDiscipline.maxAbsences ??
      selectedDiscipline.sigaaCourse?.maxAbsences;

    const drillAbsenceStatus =
      absencesCount !== undefined || selectedDiscipline.sigaaCourse
        ? calculateAbsenceRisk({
            absences: absencesCount,
            maxAbsences,
            schedule:
              selectedDiscipline.schedule ||
              selectedDiscipline.sigaaCourse?.schedule,
          })
        : null;

    // Meta SIGAA da disciplina: turma, professor, sala, horário e semestre —
    // itens sem dado não entram na linha
    const metaItems = [
      selectedDiscipline.turma || null,
      selectedDiscipline.professor
        ? `Prof. ${selectedDiscipline.professor}`
        : null,
      selectedDiscipline.classroom
        ? `Sala ${selectedDiscipline.classroom}`
        : null,
      selectedDiscipline.schedule || null,
      selectedDiscipline.semester || null,
    ].filter((part): part is string => Boolean(part));

    return (
      <PageContainer>
        {/* Título Padronizado da Página com Nome da Disciplina e Ação de Voltar */}
        <PageHeader
          icon={GraduationCap}
          title={
            <>
              {selectedDiscipline.name}{" "}
              <span className="text-sm font-bold text-neutral-500">
                ({disciplineAllItems.length}{" "}
                {disciplineAllItems.length === 1 ? "resultado" : "resultados"})
              </span>
            </>
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDiscipline(null);
                setDrillSearchQuery("");
                setDrillCategory("all");
                setDrillPlatform("all");
                setShowArchived(false);
              }}
              className="cursor-pointer flex items-center gap-1.5 font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Voltar</span>
            </Button>
          }
        />

        {/* Card de detalhes da disciplina: badges de plataforma + meta SIGAA + Faltas UnB */}
        <Card className="p-4 sm:p-5 space-y-3 pb-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedDiscipline.sigaaCourse ? (
                <Badge variant="sigaa" size="sm">
                  SIGAA
                </Badge>
              ) : null}
              {selectedDiscipline.aprenderCourses.length > 0 ? (
                <Badge variant="aprender3" size="sm">
                  Aprender 3
                </Badge>
              ) : null}
              {selectedDiscipline.teamsCourses &&
              selectedDiscipline.teamsCourses.length > 0 ? (
                <Badge variant="teams" size="sm">
                  Teams
                </Badge>
              ) : null}
              {drillAbsenceStatus && getEffectiveAbsences(selectedDiscipline) !== undefined ? (
                <Badge
                  variant={
                    drillAbsenceStatus.absences === 0
                      ? "success"
                      : drillAbsenceStatus.isExceeded || drillAbsenceStatus.isCritical
                      ? "urgent"
                      : drillAbsenceStatus.isAtRisk
                      ? "yellow"
                      : "success"
                  }
                  size="sm"
                  title={
                    drillAbsenceStatus.warningMessage ||
                    `Faltas registradas no SIGAA${hasManualAbsenceOverride ? " (ajustado manualmente)" : ""}: ${drillAbsenceStatus.absences} de ${drillAbsenceStatus.maxAbsences}h permitidas (limite de 25% da carga horária na UnB).`
                  }
                  className="font-black"
                >
                  {drillAbsenceStatus.absences}/{drillAbsenceStatus.maxAbsences} faltas
                </Badge>
              ) : selectedDiscipline.sigaaCourse ? (
                <Badge variant="neutral" size="sm" className="font-bold">
                  Sem registro no SIGAA
                </Badge>
              ) : null}
            </div>

            {metaItems.length > 0 ? (
              <>
                <span
                  className="hidden h-4 w-px bg-black/15 sm:block"
                  aria-hidden
                />
                <span className="text-xs font-semibold text-neutral-600">
                  {metaItems.join(" · ")}
                </span>
              </>
            ) : null}
          </div>

          {drillAbsenceStatus && (drillAbsenceStatus.isAtRisk || drillAbsenceStatus.isExceeded) && (
            <div className="w-full mt-3 pt-3 border-t-2 border-ink/10 text-xs font-bold">
              {drillAbsenceStatus.isExceeded ? (
                <p className="text-ink-urgent flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 stroke-[2.5] shrink-0" />
                  <span>Limite de 25% de faltas ultrapassado ({drillAbsenceStatus.absences}/{drillAbsenceStatus.maxAbsences}h). Conforme o regimento da UnB, o aluno é reprovado por faltas.</span>
                </p>
              ) : drillAbsenceStatus.isCritical ? (
                <p className="text-ink-urgent flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 stroke-[2.5] shrink-0" />
                  <span>Alerta Crítico: Resta apenas 1 aula de {drillAbsenceStatus.hoursPerClass}h para reprovação por faltas na UnB!</span>
                </p>
              ) : (
                <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 stroke-[2.5] shrink-0" />
                  <span>Atenção: Restam apenas 2 aulas ({drillAbsenceStatus.hoursPerClass}h cada) antes de atingir o limite de reprovação.</span>
                </p>
              )}
            </div>
          )}

          {/* Seção de Cálculo de Notas, Fórmula e Estimativa de Aprovação */}
          <GradeFormulaSection discipline={selectedDiscipline} embedded />

          {/* Seção de Controle de Faltas com ajuste manual (override persistido) */}
          <AbsenceSection
            discipline={selectedDiscipline}
            override={absenceOverride}
            onOverrideChange={handleAbsenceOverrideChange}
            embedded
          />
        </Card>

        {/* Barra de Filtros e Busca da Disciplina (expande para baixo no modo Selecionar) */}
        <FeedToolbar
          searchQuery={drillSearchQuery}
          onSearchChange={setDrillSearchQuery}
          searchPlaceholder="Buscar por título da tarefa, aviso ou conteúdo..."
          searchAriaLabel="Buscar no feed da disciplina"
          showPlatformFilter={drillPlatforms.length > 1}
          platformValue={drillPlatform}
          onPlatformChange={setDrillPlatform}
          platformOptions={drillPlatformOptions}
          categoryValue={drillCategory}
          onCategoryChange={setDrillCategory}
          hasActiveFilters={
            Boolean(drillSearchQuery) ||
            drillCategory !== "all" ||
            drillPlatform !== "all"
          }
          onClearFilters={() => {
            setDrillSearchQuery("");
            setDrillCategory("all");
            setDrillPlatform("all");
          }}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived(!showArchived)}
          selectionMode={isSelecting}
          selectedCount={selectedCount}
          selectedTaskCount={selectedTaskCount}
          allSelected={allSelected}
          canSelect={disciplineFeedItems.length > 0}
          onEnterSelection={selection.enter}
          onExitSelection={selection.exit}
          onToggleAllSelection={selection.toggleAll}
          onBatchComplete={handleBatchComplete}
          onBatchArchive={handleBatchArchive}
          onBatchRestore={handleBatchRestore}
        />

        {/* Feed Filtrado desta Disciplina */}
        {disciplineFeedItems.length === 0 ? (
          <EmptyState
            title={
              showArchived
                ? "Nenhum item arquivado nesta matéria"
                : "Nenhuma publicação encontrada"
            }
            description={
              showArchived && !drillSearchQuery && drillCategory === "all"
                ? "Você ainda não arquivou nenhum aviso ou tarefa desta disciplina."
                : drillSearchQuery || drillCategory !== "all"
                  ? "Nenhum aviso ou tarefa encontrado para os filtros selecionados nesta matéria."
                  : "Não há avisos ou tarefas registradas para esta disciplina até o momento."
            }
          />
        ) : (
          <div className="space-y-4">
            <Card className="p-0 overflow-hidden">
              {/* Contador do filtro: some quando não há filtro ativo */}
              {drillSearchQuery ||
              drillCategory !== "all" ||
              drillPlatform !== "all" ? (
                <div className="border-b-2 border-ink/10 bg-canvas px-4 py-2 text-xs font-bold text-neutral-600 md:px-5">
                  {disciplineFeedItems.length} de {disciplineAllItems.length}{" "}
                  {disciplineFeedItems.length === 1
                    ? "resultado"
                    : "resultados"}
                </div>
              ) : null}
              <FeedList
                items={drillPageItems}
                disciplines={disciplines}
                showDiscipline={false}
                onToggleComplete={toggleTaskCompleted}
                onArchive={handleArchive}
                onRestore={handleRestore}
                selectionMode={isSelecting}
                selectedIds={selectedIds}
                onToggleSelect={selection.handleToggleSelect}
              />
            </Card>

            <Pagination
              page={safeDrillPage}
              pageCount={drillPageCount}
              onPageChange={setDrillPage}
            />
          </div>
        )}
      </PageContainer>
    );
  }

  // View Principal: Lista de Disciplinas
  return (
    <PageContainer>
      {/* Título Padronizado da Página com Ícone da Sidebar */}
      <PageHeader icon={GraduationCap} title="Disciplinas do Semestre" />

      {/* Alerta caso haja disciplinas próximas do limite de faltas ou reprovadas */}
      {atRiskDisciplines.length > 0 ? (
        <Alert
          variant="destructive"
          icon={AlertTriangle}
          title={
            atRiskDisciplines.length === 1
              ? "1 disciplina em situação crítica de faltas (regra 25% UnB)"
              : `${atRiskDisciplines.length} disciplinas em situação crítica de faltas (regra 25% UnB)`
          }
          description="Acompanhe a estimativa de aulas restantes para reprovação nos cards abaixo para não perder matérias por infrequência."
        />
      ) : null}

      {/* Alerta caso haja turmas do Aprender 3 ou Teams não associadas */}
      {unmatchedCourses.length > 0 ? (
        <Alert
          variant="yellow"
          icon={AlertCircle}
          title={
            unmatchedCourses.length === 1
              ? "1 turma externa aguarda associação"
              : `${unmatchedCourses.length} turmas externas aguardam associação`
          }
          description="Associe para exibir os comunicados e tarefas na matéria oficial do SIGAA ou direcione para a seção Outros."
          aside={
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setResolvingCourse(unmatchedCourses[0])}
              className="cursor-pointer shrink-0 flex items-center gap-1.5 text-xs bg-neo-blue text-white hover:bg-neo-blueHover"
            >
              <Link2 className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Associar Turma</span>
            </Button>
          }
        />
      ) : null}

      {disciplines.length === 0 ? (
        <EmptyState
          title="Nenhuma disciplina no semestre"
          description='Clique em "Sincronizar" na barra lateral para carregar suas disciplinas do SIGAA e do Aprender 3.'
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {disciplines.map((discipline) => {
            const effectiveAbs = getEffectiveAbsences(discipline);
            const absenceStatus =
              effectiveAbs !== undefined
                ? calculateAbsenceRisk({
                    absences: effectiveAbs,
                    maxAbsences:
                      discipline.maxAbsences ?? discipline.sigaaCourse?.maxAbsences,
                    schedule:
                      discipline.schedule || discipline.sigaaCourse?.schedule,
                  })
                : null;

            return (
              <Card
                key={discipline.id}
                onClick={() => setSelectedDiscipline(discipline)}
                role="button"
                tabIndex={0}
                aria-label={`Ver feed da disciplina ${discipline.name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedDiscipline(discipline);
                  }
                }}
                className="cursor-pointer bg-paper rounded-lg p-5 shadow-(--neo-card-shadow) hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--neo-shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out flex flex-col justify-between group"
              >
                <div>
                  {/* Topo do card com plataformas integradas alinhadas à esquerda */}
                  <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                    {discipline.sigaaCourse ? (
                      <Badge variant="sigaa">SIGAA</Badge>
                    ) : null}
                    {discipline.aprenderCourses.length > 0 ? (
                      <Badge variant="aprender3">
                        Aprender 3
                        {discipline.aprenderCourses.length > 1
                          ? ` (${discipline.aprenderCourses.length})`
                          : ""}
                      </Badge>
                    ) : null}
                    {discipline.teamsCourses &&
                    discipline.teamsCourses.length > 0 ? (
                      <Badge variant="teams">
                        Teams
                        {discipline.teamsCourses.length > 1
                          ? ` (${discipline.teamsCourses.length})`
                          : ""}
                      </Badge>
                    ) : null}
                    {absenceStatus ? (
                      <Badge
                        variant={
                          absenceStatus.absences === 0
                            ? "success"
                            : absenceStatus.isExceeded || absenceStatus.isCritical
                            ? "urgent"
                            : absenceStatus.isAtRisk
                            ? "yellow"
                            : "success"
                        }
                        title={
                          absenceStatus.warningMessage ||
                          `Faltas registradas no SIGAA: ${absenceStatus.absences} de no máximo ${absenceStatus.maxAbsences} permitidas.`
                        }
                        className="font-black"
                      >
                        {absenceStatus.absences}/{absenceStatus.maxAbsences} faltas
                      </Badge>
                    ) : discipline.sigaaCourse ? (
                      <Badge variant="neutral" className="font-bold">
                        Sem registro no SIGAA
                      </Badge>
                    ) : null}
                  </div>

                  {/* Nome da disciplina */}
                  <h3 className="text-base font-black text-black leading-snug mb-3 group-hover:text-blue-ink transition-colors">
                    {discipline.code &&
                    !discipline.name.startsWith(discipline.code)
                      ? `${discipline.code} - ${discipline.name}`
                      : discipline.name}
                  </h3>

                  {/* Informações detalhadas */}
                  <div className="space-y-1.5 text-xs font-medium text-neutral-700">
                    {discipline.professor ? (
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5]" />
                        <span className="truncate">{discipline.professor}</span>
                      </div>
                    ) : null}

                    {discipline.classroom ? (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5]" />
                        <span className="truncate">{discipline.classroom}</span>
                      </div>
                    ) : null}

                    {discipline.schedule ? (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5]" />
                        <span className="truncate">{discipline.schedule}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Rodapé com indicadores e atalho */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t-2 border-ink/10 mt-4 text-xs font-bold">
                  <span className="text-neutral-500">{discipline.semester}</span>

                  <div className="flex items-center gap-2">
                    {discipline.pendingAssignmentsCount !== undefined &&
                    discipline.pendingAssignmentsCount > 0 ? (
                      <div className="flex items-center gap-1 text-ink-success bg-pastel-green px-2 py-0.5 border border-ink/20 rounded-md">
                        <CheckSquare className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{discipline.pendingAssignmentsCount} entregas</span>
                      </div>
                    ) : null}

                    {discipline.unreadCount !== undefined &&
                    discipline.unreadCount > 0 ? (
                      <div className="flex items-center gap-1 text-blue-ink bg-pastel-blue px-2 py-0.5 border border-ink/20 rounded-md">
                        <MessageSquare className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{discipline.unreadCount} novos</span>
                      </div>
                    ) : null}

                    <span className="text-neutral-800 text-[11px] underline decoration-2 group-hover:text-blue-ink font-extrabold ml-1">
                      Ver feed →
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Seção Outros: Equipes do Teams, Monitorias e Projetos */}
      {otherCourses.length > 0 ? (
        <div className="space-y-4 pt-6 border-t-2 border-ink/10">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-600 px-1">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 stroke-[2.5] text-blue-ink" />
              <span className="text-sm font-black text-black">
                Outras Equipes, Monitorias e Projetos ({otherCourses.length})
              </span>
            </div>
            <span className="text-neutral-500 font-semibold">Teams & Aprender 3</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherCourses.map((oc) => (
              <Card
                key={oc.id}
                onClick={() => {
                    setSelectedDiscipline({
                      id: oc.id,
                      code: oc.code,
                      name: oc.name,
                      semester: oc.semester || getDefaultAcademicSemester().semester,
                      professor: oc.professor,
                      classroom: oc.classroom,
                      teamsCourses: oc.platform === "teams" ? [oc] : [],
                      aprenderCourses: oc.platform === "aprender3" ? [oc] : [],
                      url: oc.url,
                      unreadCount: oc.unreadCount,
                      pendingAssignmentsCount: oc.pendingAssignmentsCount,
                    });
                }}
                role="button"
                tabIndex={0}
                aria-label={`Ver feed de ${oc.name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedDiscipline({
                      id: oc.id,
                      code: oc.code,
                      name: oc.name,
                      semester: oc.semester || getDefaultAcademicSemester().semester,
                      professor: oc.professor,
                      classroom: oc.classroom,
                      teamsCourses: oc.platform === "teams" ? [oc] : [],
                      aprenderCourses: oc.platform === "aprender3" ? [oc] : [],
                      url: oc.url,
                      unreadCount: oc.unreadCount,
                      pendingAssignmentsCount: oc.pendingAssignmentsCount,
                    });
                  }
                }}
                className="cursor-pointer bg-paper rounded-lg p-5 shadow-(--neo-card-shadow) hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--neo-shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Badge variant={oc.platform}>
                      {oc.platform === "teams" ? "Teams" : "Aprender 3"}
                    </Badge>
                    {oc.code && oc.code !== oc.name ? (
                      <span className="text-[11px] font-bold bg-neutral-100 px-2 py-0.5 border border-ink/20 rounded-md">
                        {oc.code}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="text-base md:text-lg font-black text-black leading-snug mb-3 group-hover:text-blue-ink transition-colors">
                    {oc.name}
                  </h3>

                  {oc.classroom || oc.professor ? (
                    <div className="space-y-1.5 text-xs font-medium text-neutral-700">
                      {oc.professor ? (
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5]" />
                          <span className="truncate">{oc.professor}</span>
                        </div>
                      ) : null}
                      {oc.classroom ? (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5]" />
                          <span className="truncate">{oc.classroom}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t-2 border-ink/10 mt-4 text-xs font-bold">
                  <span className="text-neutral-500">{oc.semester || getDefaultAcademicSemester().semester}</span>
                  <span className="text-neutral-800 text-[11px] underline decoration-2 group-hover:text-blue-ink font-extrabold">
                    Ver publicações →
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* Modal Neobrutalista para turmas do Aprender 3 sem correspondência */}
      <UnmatchedCourseDialog
        course={resolvingCourse}
        disciplines={disciplines}
        isOpen={Boolean(resolvingCourse)}
        onAssociate={async (aprenderId, sigaaId) => {
          await associateCourse(aprenderId, sigaaId, false);
          setResolvingCourse(null);
        }}
        onIgnore={async (aprenderId) => {
          await associateCourse(aprenderId, null, true);
          setResolvingCourse(null);
        }}
        onClose={() => setResolvingCourse(null)}
      />
    </PageContainer>
  );
};
