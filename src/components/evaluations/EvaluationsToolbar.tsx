import React from 'react';
import {
  SegmentedControl,
  FilterSelect,
  Switch,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui';
import { Search, X, Users, BookOpen } from 'lucide-react';
import type {
  CampusName,
  DifficultyLevel,
  ProfessorEvaluationSortBy,
} from '@/core';
import {
  CAMPUS_FILTER_OPTIONS,
  DIFFICULTY_FILTER_OPTIONS,
  SORT_OPTIONS,
  type EvaluationViewMode,
} from './types';

export interface EvaluationsToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: EvaluationViewMode;
  onViewModeChange: (mode: EvaluationViewMode) => void;
  selectedCampus: CampusName | 'all';
  onCampusChange: (campus: CampusName | 'all') => void;
  selectedDifficulty: DifficultyLevel | 'all';
  onDifficultyChange: (difficulty: DifficultyLevel | 'all') => void;
  sortBy: ProfessorEvaluationSortBy;
  onSortByChange: (sortBy: ProfessorEvaluationSortBy) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  hasCourseProfile: boolean;
  filterByCourse: boolean;
  onFilterByCourseChange: (checked: boolean) => void;
  visibleCount: number;
  totalCount: number;
}

export const EvaluationsToolbar: React.FC<EvaluationsToolbarProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  selectedCampus,
  onCampusChange,
  selectedDifficulty,
  onDifficultyChange,
  sortBy,
  onSortByChange,
  hasActiveFilters,
  onClearFilters,
  hasCourseProfile,
  filterByCourse,
  onFilterByCourseChange,
  visibleCount,
  totalCount,
}) => {
  return (
    <div className="bg-paper border-2 border-ink rounded-lg p-4 shadow-neo space-y-4">
      {/* Linha 1: Campo de Busca + Segmented Control (Professores | Disciplinas) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 stroke-[2.5]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por professor, disciplina (ex: CIC0004, Cálculo), departamento..."
            aria-label="Buscar avaliações de professores"
            className={`w-full pl-10 py-2.5 text-sm font-medium text-black border-2 border-ink rounded-xl focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[transform,box-shadow,background-color,border-color] placeholder:text-neutral-500 shadow-none ${
              searchQuery.trim() ? 'bg-pastel-blue pr-10' : 'bg-paper pr-4'
            }`}
          />
          {searchQuery.trim() !== '' && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    aria-label="Limpar busca"
                    className="cursor-pointer absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-500 hover:text-black hover:bg-black/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue transition-colors duration-150"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                  </button>
                }
              />
              <TooltipContent>Limpar busca</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Segmented Control (Professores | Disciplinas) */}
        <SegmentedControl
          className="shrink-0 self-end sm:self-auto"
          size="md"
          ariaLabel="Modo de visualização das avaliações"
          value={viewMode}
          onValueChange={(val) => onViewModeChange(val as EvaluationViewMode)}
          options={[
            {
              value: 'professors',
              label: (
                <>
                  <Users className="w-3.5 h-3.5 stroke-[2.5]" />
                  Professores
                </>
              ),
            },
            {
              value: 'disciplines',
              label: (
                <>
                  <BookOpen className="w-3.5 h-3.5 stroke-[2.5]" />
                  Disciplinas
                </>
              ),
            },
          ]}
        />
      </div>

      {/* Linha 2: Filtros com rótulo em cima (Filtro Select) + link de serviço */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <FilterSelect
          label="Campus:"
          value={selectedCampus}
          options={CAMPUS_FILTER_OPTIONS}
          active={selectedCampus !== 'all'}
          onChange={(val) => onCampusChange(val as CampusName | 'all')}
        />

        <FilterSelect
          label="Dificuldade:"
          value={selectedDifficulty}
          options={DIFFICULTY_FILTER_OPTIONS}
          active={selectedDifficulty !== 'all'}
          onChange={(val) =>
            onDifficultyChange(val as DifficultyLevel | 'all')
          }
        />

        {/* Ordenação não é filtro: sem estado engajado */}
        <FilterSelect
          label="Ordenar por:"
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={(val) => onSortByChange(val as ProfessorEvaluationSortBy)}
        />

        {/* A Regra do Link de Serviço: ação terciária de barra é texto sublinhado */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="cursor-pointer rounded-xs pb-2 text-xs font-bold text-neutral-500 hover:text-black underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2"
          >
            Limpar filtros
          </button>
        )}

        {hasCourseProfile && (
          <div className="inline-flex items-center gap-2 ml-auto pb-1.5">
            <span className="text-xs font-bold text-neutral-600">
              Filtrar pelo meu curso:
            </span>
            <Switch
              checked={filterByCourse}
              onCheckedChange={(checked) =>
                onFilterByCourseChange(checked === true)
              }
            />
          </div>
        )}
      </div>

      {/* Contagem filtrada: barra interna do card — nunca linha solta acima */}
      {hasActiveFilters && (
        <div className="border-t-2 border-black/10 pt-2 text-xs font-bold text-neutral-600">
          {viewMode === 'professors'
            ? `${visibleCount} de ${totalCount} ${
                totalCount === 1 ? 'docente' : 'docentes'
              }`
            : `${visibleCount} de ${totalCount} ${
                totalCount === 1 ? 'disciplina' : 'disciplinas'
              }`}
        </div>
      )}
    </div>
  );
};
