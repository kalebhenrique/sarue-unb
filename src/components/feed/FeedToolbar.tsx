import React, { useState } from "react";
import {
  BottomSheet,
  Button,
  HeaderIconButton,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  Archive,
  ArchiveRestore,
  CheckCircle,
  Download,
  ListChecks,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ArchivedToggleButton } from "./ArchivedToggleButton";
import type { FeedItemType, PlatformType } from "@/core";

export interface FeedToolbarProps {
  /** Busca textual do feed. */
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  /** Filtro de plataforma: só existe no feed geral (Início). */
  showPlatformFilter?: boolean;
  platformValue?: PlatformType | "all";
  onPlatformChange?: (value: PlatformType | "all") => void;
  /** Opções de plataforma (drill-down passa só as plataformas da disciplina). */
  platformOptions?: { value: PlatformType | "all"; label: string }[];
  categoryValue: FeedItemType | "all";
  onCategoryChange: (value: FeedItemType | "all") => void;
  /** Ação "Limpar filtros" (drill-down da disciplina). */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  /** Modo Selecionar: a seção expande para baixo com as ações em lote. */
  selectionMode: boolean;
  selectedCount: number;
  selectedTaskCount: number;
  allSelected: boolean;
  /** Esconde o botão Selecionar quando não há o que selecionar. */
  canSelect?: boolean;
  onEnterSelection: () => void;
  onExitSelection: () => void;
  onToggleAllSelection: () => void;
  onBatchComplete: () => void;
  onBatchArchive: () => void;
  onBatchRestore: () => void;
  /** Quando há atualização do app disponível, exibe botão ao lado de Arquivados / Selecionar. */
  hasUpdateAvailable?: boolean;
  updateVersion?: string;
  onOpenUpdateDialog?: () => void;
}

const PLATFORM_OPTIONS: { value: PlatformType | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "sigaa", label: "Sigaa" },
  { value: "aprender3", label: "Aprender 3" },
  { value: "teams", label: "Teams" },
];

const CATEGORY_OPTIONS: { value: FeedItemType | "all"; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "assignment", label: "Tarefas" },
  { value: "post", label: "Avisos" },
];

/**
 * Barra de filtros e busca do feed, em card próprio (Início e drill-down da
 * Disciplina). O botão Selecionar não troca a seção: ao entrar no modo, a
 * barra de ações em lote surge ABAIXO dos filtros, expandindo o card.
 */
export const FeedToolbar: React.FC<FeedToolbarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  showPlatformFilter = false,
  platformValue,
  onPlatformChange,
  platformOptions,
  categoryValue,
  onCategoryChange,
  hasActiveFilters = false,
  onClearFilters,
  showArchived,
  onToggleArchived,
  selectionMode,
  selectedCount,
  selectedTaskCount,
  allSelected,
  canSelect = true,
  onEnterSelection,
  onExitSelection,
  onToggleAllSelection,
  onBatchComplete,
  onBatchArchive,
  onBatchRestore,
  hasUpdateAvailable = false,
  updateVersion,
  onOpenUpdateDialog,
}) => {
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = React.useRef<HTMLInputElement>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const hasSheetFilters =
    (showPlatformFilter && (platformValue ?? "all") !== "all") ||
    categoryValue !== "all";
  const resolvedPlatformOptions = platformOptions ?? PLATFORM_OPTIONS;

  return (
    <>
      {/* Mobile: Busca em 1 linha + botão de filtros + barra flutuante de seleção */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 stroke-[2.5]" />
            <input
              ref={mobileSearchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel}
              className={`w-full h-10 pl-9 text-sm font-medium text-black border-2 border-ink rounded-xl focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[background-color,border-color] placeholder:text-neutral-500 shadow-neo-sm ${
                searchQuery.trim() ? "bg-pastel-blue pr-9" : "bg-paper pr-3"
              }`}
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
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
            aria-label="Filtros"
            hasActiveIndicator={hasSheetFilters}
            active={filterSheetOpen || hasSheetFilters}
            onClick={() => setFilterSheetOpen(true)}
          >
            <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
          </HeaderIconButton>
        </div>

        {showArchived ? (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-pastel-yellow border-2 border-ink rounded-lg text-xs font-bold text-black">
            <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
              <Archive className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
              Exibindo itens arquivados
            </span>
            <button
              type="button"
              onClick={onToggleArchived}
              className="cursor-pointer shrink-0 underline font-extrabold hover:text-blue-ink"
            >
              Sair
            </button>
          </div>
        ) : null}
      </div>

      {/* Bottom Sheet de filtros no mobile */}
      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        role="dialog"
        aria-label="Filtros do feed"
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
            {hasSheetFilters ? (
              <button
                type="button"
                onClick={() => {
                  onPlatformChange?.("all");
                  onCategoryChange("all");
                }}
                className="cursor-pointer text-xs font-bold text-neutral-600 underline hover:text-black"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>

          <div className="space-y-4 pt-3 pb-2">
            {showPlatformFilter && onPlatformChange ? (
              <div className="space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wide text-neutral-600">
                  Plataformas
                </span>
                <div className="flex flex-wrap gap-2">
                  {resolvedPlatformOptions.map((opt) => {
                    const selected = (platformValue ?? "all") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          onPlatformChange(opt.value as PlatformType | "all")
                        }
                        className={`cursor-pointer px-3 py-2 text-xs font-bold rounded-lg border-2 border-ink transition-colors ${
                          selected
                            ? "bg-neo-blue text-white"
                            : "bg-paper text-black hover:bg-neutral-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <span className="text-xs font-extrabold uppercase tracking-wide text-neutral-600">
                Categoria
              </span>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((opt) => {
                  const selected = categoryValue === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        onCategoryChange(opt.value as FeedItemType | "all")
                      }
                      className={`cursor-pointer px-3 py-2 text-xs font-bold rounded-lg border-2 border-ink transition-colors ${
                        selected
                          ? "bg-neo-blue text-white"
                          : "bg-paper text-black hover:bg-neutral-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Barra flutuante de ações em lote no mobile */}
      {selectionMode ? (
        <div
          role="region"
          aria-label="Ações em lote"
          className="md:hidden fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 bg-paper border-2 border-ink rounded-xl shadow-[0_4px_0_0_var(--neo-shadow)] p-2.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-bold">
            <span className="text-neutral-700">
              <span className="text-blue-ink font-extrabold">{selectedCount}</span>{" "}
              {selectedCount === 1 ? "selecionado" : "selecionados"}
            </span>
            <button
              type="button"
              onClick={onToggleAllSelection}
              className="cursor-pointer underline text-neutral-600 hover:text-black"
            >
              {allSelected ? "Limpar tudo" : "Selecionar tudo"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!showArchived ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                className="flex-1"
                disabled={selectedTaskCount === 0}
                onClick={onBatchComplete}
              >
                <CheckCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                Concluir
              </Button>
            ) : null}

            {showArchived ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={selectedCount === 0}
                onClick={onBatchRestore}
              >
                <ArchiveRestore className="w-3.5 h-3.5 stroke-[2.5]" />
                Desarquivar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={selectedCount === 0}
                onClick={onBatchArchive}
              >
                <Archive className="w-3.5 h-3.5 stroke-[2.5]" />
                Arquivar
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onExitSelection}
              aria-label="Cancelar seleção"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Desktop: card completo de busca, filtros e expansão de seleção */}
      <div className="hidden md:block bg-paper border-2 border-ink rounded-lg shadow-(--neo-card-shadow)">
        <div className="space-y-3 p-4">
          {/* Busca textual */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 stroke-[2.5]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel}
              className={`w-full pl-10 py-2.5 text-sm font-medium text-black border-2 border-ink rounded-xl focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[transform,box-shadow,background-color,border-color] placeholder:text-neutral-500 shadow-none ${
                searchQuery.trim() ? "bg-pastel-blue pr-10" : "bg-paper pr-4"
              }`}
            />

            {/* Limpar busca: só existe com busca engajada; devolve o foco ao campo */}
            {searchQuery.trim() ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => {
                        onSearchChange("");
                        searchInputRef.current?.focus();
                      }}
                      aria-label="Limpar busca"
                      className="cursor-pointer absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-500 hover:text-black hover:bg-black/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue transition-colors duration-150"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  }
                />
                <TooltipContent>Limpar busca</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          {/* Filtros e Arquivados à esquerda; modo Selecionar à direita */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              {showPlatformFilter && onPlatformChange ? (
                <FilterSelect
                  label="Plataformas:"
                  value={platformValue ?? "all"}
                  options={platformOptions ?? PLATFORM_OPTIONS}
                  active={(platformValue ?? "all") !== "all"}
                  onChange={(value) =>
                    onPlatformChange(value as PlatformType | "all")
                  }
                />
              ) : null}

              <FilterSelect
                label="Categoria:"
                value={categoryValue}
                options={CATEGORY_OPTIONS}
                active={categoryValue !== "all"}
                onChange={(value) => onCategoryChange(value as FeedItemType | "all")}
              />

              {hasActiveFilters && onClearFilters ? (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="cursor-pointer rounded-xs pb-2 text-xs font-bold text-neutral-500 hover:text-black underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>

            {/* Arquivados e Atualização ao lado esquerdo do modo Selecionar */}
            <div className="flex flex-wrap items-end gap-3">
              {hasUpdateAvailable && onOpenUpdateDialog ? (
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  className="h-[34px] bg-neo-yellow text-ink hover:bg-neo-yellowHover"
                  onClick={onOpenUpdateDialog}
                  title={
                    updateVersion
                      ? `Nova atualização v${updateVersion} disponível`
                      : "Nova atualização disponível"
                  }
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  {updateVersion ? `Atualizar (v${updateVersion})` : "Atualizar"}
                </Button>
              ) : null}
              <ArchivedToggleButton
                showArchived={showArchived}
                onToggle={onToggleArchived}
              />
              {canSelect ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-[34px]"
                  aria-pressed={selectionMode}
                  onClick={selectionMode ? onExitSelection : onEnterSelection}
                  title={
                    selectionMode
                      ? "Sai do modo de seleção (Esc)"
                      : "Selecionar vários itens para concluir ou arquivar em lote"
                  }
                >
                  <ListChecks className="w-3.5 h-3.5 stroke-[2.5]" />
                  Selecionar
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Modo Selecionar: expansão de altura animada (0fr→1fr), sem esconder
            filtros nem busca; inerte ao foco quando recolhida */}
        <div
          className={`grid transition-[grid-template-rows] duration-150 ease-out ${
            selectionMode ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
          aria-hidden={!selectionMode}
          inert={!selectionMode}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-t-2 border-ink/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Estado da seleção: contagem + alternar todos */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold text-neutral-600">
                    <span className="text-blue-ink">{selectedCount}</span>{" "}
                    {selectedCount === 1
                      ? "item selecionado"
                      : "itens selecionados"}
                  </span>
                  <button
                    type="button"
                    onClick={onToggleAllSelection}
                    className="cursor-pointer rounded-xs text-xs font-bold text-neutral-500 hover:text-black underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2"
                  >
                    {allSelected ? "Limpar tudo" : "Selecionar tudo"}
                  </button>
                </div>

                {/* Ações em lote: principal, secundária, sair — contagem já está à esquerda */}
                <div className="flex flex-wrap items-center gap-2">
                  {!showArchived ? (
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      disabled={selectedTaskCount === 0}
                      onClick={onBatchComplete}
                      title="Marca as tarefas selecionadas como concluídas (avisos não se concluem)"
                    >
                      <CheckCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                      Concluir
                    </Button>
                  ) : null}

                  {showArchived ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={selectedCount === 0}
                      onClick={onBatchRestore}
                      title="Devolve os itens selecionados ao feed ativo"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5 stroke-[2.5]" />
                      Desarquivar
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={selectedCount === 0}
                      onClick={onBatchArchive}
                      title="Move os itens selecionados para os Arquivados"
                    >
                      <Archive className="w-3.5 h-3.5 stroke-[2.5]" />
                      Arquivar
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onExitSelection}
                    title="Sai do modo de seleção e limpa a escolha (Esc)"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
