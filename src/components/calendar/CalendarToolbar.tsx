import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  GraduationCap,
  CheckSquare,
} from 'lucide-react';
import {
  Button,
  SegmentedControl,
  type SegmentedOption,
} from '@/components/ui';
import { FilterSelect } from '@/components/ui/filter-select';
import type { CalendarViewMode } from '@/hooks/useCalendar';
import type { Course } from '@/core';

interface CalendarToolbarProps {
  currentDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToToday: () => void;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  showAcademic: boolean;
  onToggleAcademic: () => void;
  showManual: boolean;
  onToggleManual: () => void;
  showFeedTasks: boolean;
  onToggleFeedTasks: () => void;
  courses: Course[];
  selectedCourse: string;
  onCourseChange: (course: string) => void;
  onOpenCreateDialog?: () => void;
  onResetFilters?: () => void;
}

const VIEW_OPTIONS: ReadonlyArray<SegmentedOption<CalendarViewMode>> = [
  { value: 'month', label: 'Mês & Agenda', title: 'Grade mensal e agenda do dia' },
  { value: 'agenda', label: 'Agenda Completa', title: 'Linha do tempo contínua de eventos' },
];

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  currentDate,
  onPrevMonth,
  onNextMonth,
  onGoToToday,
  viewMode,
  onViewModeChange,
  showAcademic,
  onToggleAcademic,
  showManual,
  onToggleManual,
  showFeedTasks,
  onToggleFeedTasks,
  courses,
  selectedCourse,
  onCourseChange,
  onOpenCreateDialog: _onOpenCreateDialog,
  onResetFilters,
}) => {
  const monthName = MONTH_NAMES[currentDate.getMonth()];
  const year = currentDate.getFullYear();

  const courseOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    courses.forEach((c) => {
      const key = (c.code || c.name).trim();
      if (!key) return;
      const upper = key.toUpperCase();
      if (!map.has(upper)) {
        const label = c.code && c.code !== c.name ? `${c.code} - ${c.name}` : c.name;
        map.set(upper, {
          value: upper,
          label,
        });
      }
    });

    return [
      { value: 'all', label: 'Todas as matérias' },
      ...Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [courses]);

  const hasActiveFilters =
    !showAcademic ||
    !showManual ||
    !showFeedTasks ||
    (Boolean(selectedCourse) && selectedCourse !== 'all');

  const handleResetFilters = () => {
    if (onResetFilters) {
      onResetFilters();
    } else {
      if (!showAcademic) onToggleAcademic();
      if (!showManual) onToggleManual();
      if (!showFeedTasks) onToggleFeedTasks();
      if (selectedCourse !== 'all') onCourseChange('all');
    }
  };

  return (
    <div className="bg-paper border-2 border-ink rounded-xl p-4 shadow-[4px_4px_0px_0px_var(--neo-shadow)] space-y-4">
      {/* Linha superior: Navegação de Mês/Ano + Alternador de Visão + Botão Novo Evento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Navegador de Mês */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border-2 border-ink rounded-xl bg-canvas overflow-hidden shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
            <button
              type="button"
              onClick={onPrevMonth}
              title="Mês anterior"
              aria-label="Mês anterior"
              className="p-2 hover:bg-neutral-200 dark:hover:bg-neutral-300 transition-colors text-black active:translate-y-[1px] cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>
            <div className="px-4 py-1.5 border-x-2 border-ink min-w-[170px] text-center bg-paper">
              <span className="font-black text-base tracking-tight text-black block capitalize">
                {monthName} <span className="text-neo-blue">{year}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={onNextMonth}
              title="Próximo mês"
              aria-label="Próximo mês"
              className="p-2 hover:bg-neutral-200 dark:hover:bg-neutral-300 transition-colors text-black active:translate-y-[1px] cursor-pointer"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onGoToToday}
            className="font-bold text-xs cursor-pointer"
            title="Voltar para o dia de hoje"
          >
            Hoje
          </Button>
        </div>

        {/* Lado Direito: Alternador Mês/Agenda */}
        <div className="flex items-center gap-3">
          <SegmentedControl<CalendarViewMode>
            options={VIEW_OPTIONS}
            value={viewMode}
            onValueChange={onViewModeChange}
            ariaLabel="Modo de visualização do calendário"
            size="sm"
            className="w-56"
          />
        </div>
      </div>

      {/* Linha inferior: Filtros de Tipo e Barra de Busca */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-2 border-t-2 border-black/10">
        {/* Chips de filtro com visual de adesivos seguindo o padrão com rótulo acima */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-neutral-700">Filtros:</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onToggleAcademic}
              aria-pressed={showAcademic}
              className={`cursor-pointer inline-flex items-center gap-1.5 px-3 h-[34px] rounded-xl text-xs font-bold transition-all ${
                showAcademic
                  ? 'bg-pastel-blue text-ink-disc-blue border-2 border-[#468AFB] shadow-[2px_2px_0px_0px_var(--neo-shadow)]'
                  : 'bg-paper text-neutral-600 border-2 border-dashed border-ink/30 hover:border-solid hover:text-black'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 stroke-[2.5] text-[#468AFB]" />
              <span>Calendário Acadêmico (UnB)</span>
            </button>

            <button
              type="button"
              onClick={onToggleManual}
              aria-pressed={showManual}
              className={`cursor-pointer inline-flex items-center gap-1.5 px-3 h-[34px] rounded-xl text-xs font-bold transition-all ${
                showManual
                  ? 'bg-pastel-green text-ink-disc-green border-2 border-[#16A34A] shadow-[2px_2px_0px_0px_var(--neo-shadow)]'
                  : 'bg-paper text-neutral-600 border-2 border-dashed border-ink/30 hover:border-solid hover:text-black'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5 stroke-[2.5] text-[#16A34A]" />
              <span>Meus Eventos</span>
            </button>

            <button
              type="button"
              onClick={onToggleFeedTasks}
              aria-pressed={showFeedTasks}
              className={`cursor-pointer inline-flex items-center gap-1.5 px-3 h-[34px] rounded-xl text-xs font-bold transition-all ${
                showFeedTasks
                  ? 'bg-pastel-yellow text-ink-disc-yellow border-2 border-[#EAB308] shadow-[2px_2px_0px_0px_var(--neo-shadow)]'
                  : 'bg-paper text-neutral-600 border-2 border-dashed border-ink/30 hover:border-solid hover:text-black'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 stroke-[2.5] text-[#EAB308]" />
              <span>Tarefas do Feed</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-bold text-neutral-500 hover:text-black dark:hover:text-white underline cursor-pointer ml-1"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Select de filtro por matérias do usuário seguindo o padrão FilterSelect */}
        <div className="w-full sm:w-[240px] shrink-0">
          <FilterSelect
            label="Matéria:"
            value={selectedCourse || 'all'}
            options={courseOptions}
            onChange={onCourseChange}
            active={Boolean(selectedCourse && selectedCourse !== 'all')}
          />
        </div>
      </div>
    </div>
  );
};
