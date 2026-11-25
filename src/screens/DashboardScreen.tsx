import React, { useMemo, useState } from "react";
import { FeedList } from "../components/feed/FeedList";
import { FeedListSkeleton } from "../components/feed/FeedListSkeleton";
import { FeedToolbar } from "../components/feed/FeedToolbar";
import { useFeed } from "../hooks/useFeed";
import { useFeedSelection } from "../hooks/useFeedSelection";
import {
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HeaderIconButton,
  Pagination,
  PageContainer,
  PageHeader,
  toast,
  EmptyState,
} from "@/components/ui";
import { Archive, CheckSquare, Download, Home, MoreVertical } from "lucide-react";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { AppUpdateDialog } from "../components/settings/AppUpdaterCard";

export const DashboardScreen: React.FC = () => {
  const {
    items,
    disciplines,
    isLoading,
    hasLoadedOnce,
    totalItems,
    selectedPlatform,
    setSelectedPlatform,
    selectedType,
    setSelectedType,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    toggleTaskCompleted,
    archiveFeedItem,
    completeTasksBatch,
    archiveItemsBatch,
  } = useFeed();

  const PAGE_SIZE = 25;
  const { hasUpdateAvailable, updateInfo } = useAppUpdater();
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const filterKey = `${selectedPlatform}|${selectedType}|${searchQuery}|${showArchived}`;
  const [page, setPage] = useState(1);
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = items.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const isInitialLoad = isLoading && !hasLoadedOnce;

  // Modo Selecionar (lote): vive por página — trocar filtro/página derruba o modo (resetKey)
  const pageIds = useMemo(() => pageItems.map((i) => i.id), [pageItems]);
  const selection = useFeedSelection(pageIds, `${filterKey}|${safePage}`);
  const { isSelecting, selectedIds } = selection;
  const selectedItems = useMemo(
    () => pageItems.filter((i) => selectedIds.has(i.id)),
    [pageItems, selectedIds],
  );
  const selectedCount = selectedItems.length;
  const selectedTaskCount = selectedItems.filter(
    (i) => i.itemType === "assignment",
  ).length;
  const allSelected =
    pageItems.length > 0 && pageItems.every((i) => selectedIds.has(i.id));

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
          ? "O item retornou ao seu feed ativo."
          : "Os itens retornaram ao feed ativo.",
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
      description: "O item retornou ao seu feed ativo.",
      type: "success",
      timeout: 4000,
    });
  };

  const resultLabel = `${totalItems} ${totalItems === 1 ? "resultado" : "resultados"}`;
  const hasActiveFilters =
    selectedPlatform !== "all" ||
    selectedType !== "all" ||
    searchQuery.trim().length > 0;

  return (
    <PageContainer className={isSelecting ? "pb-40 md:pb-12" : undefined}>
      {/* Título Padronizado da Página com marca no mobile e contagem de resultados */}
      <PageHeader
        icon={Home}
        title={
          <>
            <span className="inline-flex items-center gap-2.5 md:hidden">
              <span className="w-10 h-10 border-2 border-ink rounded-xl overflow-hidden shadow-neo-sm flex items-center justify-center bg-paper shrink-0">
                <img
                  src="/sarue-logo.png"
                  alt="Saruê UnB"
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
              </span>
              <span className="font-extrabold text-base tracking-tight whitespace-nowrap text-black">
                Saruê <span className="text-unb-blue">UnB</span>
              </span>
            </span>
            <span className="hidden md:inline">Início</span>
          </>
        }
        count={hasLoadedOnce ? totalItems : null}
        subtitle={hasLoadedOnce ? `(${resultLabel})` : null}
        mobileActions={
          <>
            {hasUpdateAvailable ? (
              <HeaderIconButton
                aria-label={
                  updateInfo?.version
                    ? `Nova atualização v${updateInfo.version} disponível`
                    : "Nova atualização disponível"
                }
                title={
                  updateInfo?.version
                    ? `Nova atualização v${updateInfo.version} disponível`
                    : "Nova atualização disponível"
                }
                onClick={() => setUpdateDialogOpen(true)}
                className="bg-neo-yellow text-ink hover:bg-neo-yellowHover"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
              </HeaderIconButton>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <HeaderIconButton
                    aria-label="Mais ações"
                    hasActiveIndicator={showArchived || isSelecting}
                  >
                    <MoreVertical className="w-4 h-4 stroke-[2.5]" />
                  </HeaderIconButton>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <Archive className="w-4 h-4 stroke-[2.5]" />
                  {showArchived ? "Ver itens ativos" : "Arquivados"}
                </DropdownMenuItem>
                {items.length > 0 ? (
                  <DropdownMenuItem
                    onClick={
                      isSelecting ? selection.exit : selection.enter
                    }
                  >
                    <CheckSquare className="w-4 h-4 stroke-[2.5]" />
                    {isSelecting ? "Sair da seleção" : "Selecionar itens"}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Barra de Filtros e Busca (card próprio; expande para baixo no modo Selecionar) */}
      <FeedToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar por disciplina, título da tarefa, aviso ou professor..."
        searchAriaLabel="Buscar no feed"
        showPlatformFilter
        platformValue={selectedPlatform}
        onPlatformChange={setSelectedPlatform}
        categoryValue={selectedType}
        onCategoryChange={setSelectedType}
        hasActiveFilters={
          Boolean(searchQuery) ||
          selectedType !== "all" ||
          selectedPlatform !== "all"
        }
        onClearFilters={() => {
          setSearchQuery("");
          setSelectedType("all");
          setSelectedPlatform("all");
        }}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived(!showArchived)}
        selectionMode={isSelecting}
        selectedCount={selectedCount}
        selectedTaskCount={selectedTaskCount}
        allSelected={allSelected}
        canSelect={items.length > 0}
        onEnterSelection={selection.enter}
        onExitSelection={selection.exit}
        onToggleAllSelection={selection.toggleAll}
        onBatchComplete={handleBatchComplete}
        onBatchArchive={handleBatchArchive}
        onBatchRestore={handleBatchRestore}
        hasUpdateAvailable={hasUpdateAvailable}
        updateVersion={updateInfo?.version}
        onOpenUpdateDialog={() => setUpdateDialogOpen(true)}
      />

      <AppUpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
      />

      {/* Lista do Feed Cronológico */}
      {isInitialLoad ? (
        <Card
          className="p-0 overflow-hidden"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Carregando feed acadêmico...</span>
          <FeedListSkeleton />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          title={
            showArchived
              ? "Nenhum item arquivado encontrado"
              : "Nenhum item encontrado"
          }
          description={
            showArchived
              ? "Você ainda não arquivou nenhum aviso ou tarefa."
              : 'Não há avisos ou tarefas correspondentes aos filtros selecionados. Clique em "Sincronizar" na barra lateral para atualizar os portais.'
          }
        />
      ) : (
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden">
            {/* Contador do filtro: some quando não há filtro ativo */}
            {hasActiveFilters ? (
              <div className="border-b-2 border-ink/10 bg-canvas px-4 py-2 text-xs font-bold text-neutral-600 md:px-5">
                {items.length} de {totalItems}{" "}
                {items.length === 1 ? "resultado" : "resultados"}
              </div>
            ) : null}
            <FeedList
              items={pageItems}
              disciplines={disciplines}
              onToggleComplete={toggleTaskCompleted}
              onArchive={handleArchive}
              onRestore={handleRestore}
              selectionMode={isSelecting}
              selectedIds={selectedIds}
              onToggleSelect={selection.handleToggleSelect}
            />
          </Card>

          <Pagination
            page={safePage}
            pageCount={pageCount}
            onPageChange={setPage}
          />
        </div>
      )}
    </PageContainer>
  );
};
