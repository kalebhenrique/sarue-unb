import React, { useMemo, useState, useEffect } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
} from 'lucide-react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import {
  Button,
  Checkbox,
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
  onSelectMonth?: (year: number, monthIndex: number) => void;
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
  {
    value: 'month',
    label: (
      <>
        <CalendarDays className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
        Mês
      </>
    ),
    title: 'Grade mensal e agenda do dia',
  },
  {
    value: 'agenda',
    label: (
      <>
        <List className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
        Lista
      </>
    ),
    title: 'Linha do tempo contínua de eventos',
  },
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

const MONTH_SHORT_NAMES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  currentDate,
  onPrevMonth,
  onNextMonth,
  onSelectMonth,
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
  const monthIndex = currentDate.getMonth();
  const monthName = MONTH_NAMES[monthIndex];
  const year = currentDate.getFullYear();

  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);

  useEffect(() => {
    if (monthPickerOpen) {
      setPickerYear(year);
    }
  }, [monthPickerOpen, year]);

  const now = new Date();
  const currentActualYear = now.getFullYear();
  const currentActualMonth = now.getMonth();

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
            <PopoverPrimitive.Root open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
              <PopoverPrimitive.Trigger
                type="button"
                title="Selecionar mês e ano"
                aria-label="Selecionar mês e ano"
                className="cursor-pointer px-4 py-1.5 border-x-2 border-ink min-w-[170px] text-center bg-paper hover:bg-neutral-100 dark:hover:bg-neutral-200 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neo-blue"
              >
                <span className="font-black text-base tracking-tight text-black block capitalize">
                  {monthName} <span className="text-neo-blue">{year}</span>
                </span>
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Positioner
                  side="bottom"
                  align="center"
                  sideOffset={6}
                  className="isolate z-50"
                >
                  <PopoverPrimitive.Popup className="z-50 w-64 rounded-xl border-2 border-ink bg-paper p-3 text-black outline-hidden origin-(--transform-origin) transition-[opacity,transform] duration-150 ease-out data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
                    {/* Cabeçalho de Ano */}
                    <div className="flex items-center justify-between mb-3">
                      <button
                        type="button"
                        onClick={() => setPickerYear((y) => y - 1)}
                        aria-label="Ano anterior"
                        className="cursor-pointer inline-flex size-7 items-center justify-center rounded-lg border-2 border-ink bg-canvas text-black hover:bg-neutral-200 dark:hover:bg-neutral-300 transition-colors"
                      >
                        <ChevronLeft className="size-4 stroke-[2.5]" />
                      </button>
                      <span className="text-sm font-black text-black select-none">
                        {pickerYear}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPickerYear((y) => y + 1)}
                        aria-label="Próximo ano"
                        className="cursor-pointer inline-flex size-7 items-center justify-center rounded-lg border-2 border-ink bg-canvas text-black hover:bg-neutral-200 dark:hover:bg-neutral-300 transition-colors"
                      >
                        <ChevronRight className="size-4 stroke-[2.5]" />
                      </button>
                    </div>

                    {/* Grade 3x4 de Meses */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {MONTH_SHORT_NAMES.map((shortLabel, idx) => {
                        const isSelected = pickerYear === year && idx === monthIndex;
                        const isCurrentMonthToday =
                          pickerYear === currentActualYear && idx === currentActualMonth;

                        return (
                          <button
                            key={shortLabel}
                            type="button"
                            onClick={() => {
                              onSelectMonth?.(pickerYear, idx);
                              setMonthPickerOpen(false);
                            }}
                            className={`cursor-pointer py-1.5 px-2 rounded-lg border-2 text-xs font-bold transition-colors select-none ${
                              isSelected
                                ? 'border-ink bg-neo-blue font-black text-white hover:bg-neo-blueHover'
                                : isCurrentMonthToday
                                ? 'border-ink bg-neo-yellow font-black text-ink hover:bg-neo-yellowHover'
                                : 'border-transparent text-black hover:bg-neutral-100 dark:hover:bg-neutral-200 hover:border-ink/40'
                            }`}
                          >
                            {shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
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

        {/* Lado Direito: Alternador Mês/Lista */}
        <div className="flex items-center gap-3">
          <SegmentedControl<CalendarViewMode>
            options={VIEW_OPTIONS}
            value={viewMode}
            onValueChange={onViewModeChange}
            ariaLabel="Modo de visualização do calendário"
            size="sm"
            className="w-40"
          />
        </div>
      </div>

      {/* Linha inferior: Filtros de Tipo e Barra de Busca */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-2 border-t-2 border-black/10">
        {/* Filtros com Checkbox de cada cor + texto */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-neutral-700">Filtros:</span>
          <div className="flex items-center gap-4 flex-wrap min-h-[34px]">
            <label className="cursor-pointer inline-flex items-center gap-2 text-xs font-bold text-black select-none">
              <Checkbox
                checked={showAcademic}
                onCheckedChange={() => onToggleAcademic()}
                className="data-checked:bg-[#468AFB] data-checked:text-white hover:bg-neutral-100"
              />
              <span>Calendário Acadêmico (UnB)</span>
            </label>

            <label className="cursor-pointer inline-flex items-center gap-2 text-xs font-bold text-black select-none">
              <Checkbox
                checked={showManual}
                onCheckedChange={() => onToggleManual()}
                className="data-checked:bg-neo-green data-checked:text-ink hover:bg-neutral-100"
              />
              <span>Meus Eventos</span>
            </label>

            <label className="cursor-pointer inline-flex items-center gap-2 text-xs font-bold text-black select-none">
              <Checkbox
                checked={showFeedTasks}
                onCheckedChange={() => onToggleFeedTasks()}
                className="data-checked:bg-neo-yellow data-checked:text-ink hover:bg-neutral-100"
              />
              <span>Tarefas do Feed</span>
            </label>

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

        {/* Select de filtro por matérias do usuário abrindo para baixo indo para a esquerda */}
        <div className="w-full sm:w-[240px] shrink-0">
          <FilterSelect
            label="Matéria:"
            value={selectedCourse || 'all'}
            options={courseOptions}
            onChange={onCourseChange}
            active={Boolean(selectedCourse && selectedCourse !== 'all')}
            align="end"
          />
        </div>
      </div>
    </div>
  );
};
