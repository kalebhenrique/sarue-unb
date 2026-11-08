import React, { useMemo, useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import type { CalendarDayCell } from '@/hooks/useCalendar';
import type { UnifiedCalendarEvent } from '@/core';
import { getCalendarEventColors } from './calendar-colors';

interface CalendarMonthGridProps {
  days: CalendarDayCell[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onAddEventOnDate: (startDate: string, endDate?: string) => void;
  onEventClick?: (event: UnifiedCalendarEvent) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const formatDateBR = (iso: string) => {
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return iso;
};

interface WeekEventSegment {
  event: UnifiedCalendarEvent;
  startCol: number; // 0..6
  endCol: number; // 0..6
  isMultiDay: boolean;
  startsBeforeWeek: boolean;
  endsAfterWeek: boolean;
  track: number; // 0, 1, 2...
}

const MAX_VISIBLE_TRACKS = 2;

export const CalendarMonthGrid: React.FC<CalendarMonthGridProps> = ({
  days,
  selectedDate,
  onSelectDate,
  onAddEventOnDate,
  onEventClick,
}) => {
  // Estado para arrastar e selecionar período entre datas (drag-to-select range)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragHover, setDragHover] = useState<string | null>(null);

  // Intervalo ativo sendo selecionado pelo usuário
  const activeDragRange = useMemo(() => {
    if (!isDragging || !dragStart || !dragHover) return null;
    const start = dragStart <= dragHover ? dragStart : dragHover;
    const end = dragStart <= dragHover ? dragHover : dragStart;
    return { start, end };
  }, [isDragging, dragStart, dragHover]);

  // Captura soltura do mouse globalmente para confirmar o período
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseUp = () => {
      if (dragStart && dragHover) {
        if (dragStart !== dragHover) {
          const start = dragStart <= dragHover ? dragStart : dragHover;
          const end = dragStart <= dragHover ? dragHover : dragStart;
          onAddEventOnDate(start, end);
        } else {
          onSelectDate(dragStart);
        }
      }
      setIsDragging(false);
      setDragStart(null);
      setDragHover(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDragging(false);
        setDragStart(null);
        setDragHover(null);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDragging, dragStart, dragHover, onAddEventOnDate, onSelectDate]);

  // Agrupa as 42 células em 6 semanas de 7 dias
  const weeks = useMemo(() => {
    const result: CalendarDayCell[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  return (
    <div className="bg-paper border-2 border-ink rounded-xl p-3 sm:p-4 shadow-[4px_4px_0px_0px_var(--neo-shadow)] select-none">
      {/* Cabeçalho dos Dias da Semana */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2 text-center">
        {WEEKDAYS.map((day, idx) => {
          const isWeekend = idx === 0 || idx === 6;
          return (
            <div
              key={day}
              className={`py-1 text-[11px] sm:text-xs font-black uppercase tracking-wider ${
                isWeekend ? 'text-neutral-500' : 'text-neutral-700'
              }`}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Grade de Semanas com Blocos Lineares de Eventos Contínuos */}
      <div className="space-y-1.5 sm:space-y-2">
        {weeks.map((weekDays, weekIdx) => {
          const weekStartDate = weekDays[0].date;
          const weekEndDate = weekDays[6].date;

          // 1. Coleta todos os eventos únicos ativos nesta semana
          const uniqueEventsMap = new Map<string, UnifiedCalendarEvent>();
          for (const cell of weekDays) {
            for (const evt of cell.events) {
              if (!uniqueEventsMap.has(evt.id)) {
                uniqueEventsMap.set(evt.id, evt);
              }
            }
          }

          const weekEvents = Array.from(uniqueEventsMap.values());

          // 2. Calcula colunas e propriedades de cada evento nesta semana
          interface RawSegment {
            event: UnifiedCalendarEvent;
            startCol: number;
            endCol: number;
            isMultiDay: boolean;
            startsBeforeWeek: boolean;
            endsAfterWeek: boolean;
            spanLength: number;
          }

          const rawSegments: RawSegment[] = weekEvents
            .map((evt) => {
              const evtStart = evt.date;
              const evtEnd = evt.endDate && evt.endDate >= evt.date ? evt.endDate : evt.date;

              const startsBeforeWeek = evtStart < weekStartDate;
              const endsAfterWeek = evtEnd > weekEndDate;

              let startCol = 0;
              if (!startsBeforeWeek) {
                const idx = weekDays.findIndex((d) => d.date === evtStart);
                startCol = idx >= 0 ? idx : 0;
              }

              let endCol = 6;
              if (!endsAfterWeek) {
                const idx = weekDays.findIndex((d) => d.date === evtEnd);
                endCol = idx >= 0 ? idx : 6;
              }

              if (endCol < startCol) {
                endCol = startCol;
              }

              const isMultiDay = evtEnd > evtStart || endCol > startCol;
              const spanLength = endCol - startCol + 1;

              return {
                event: evt,
                startCol,
                endCol,
                isMultiDay,
                startsBeforeWeek,
                endsAfterWeek,
                spanLength,
              };
            })
            // Ordenação: blocos lineares que duram mais dias vêm primeiro, depois por coluna inicial
            .sort((a, b) => {
              if (b.spanLength !== a.spanLength) {
                return b.spanLength - a.spanLength;
              }
              return a.startCol - b.startCol;
            });

          // 3. Alocação de trilhas (tracks) horizontais para garantir blocos lineares contínuos
          const tracks: boolean[][] = [];
          const visibleSegments: WeekEventSegment[] = [];
          const overflowByCol = [0, 0, 0, 0, 0, 0, 0];

          for (const seg of rawSegments) {
            let assignedTrack = -1;
            for (let t = 0; t < tracks.length; t++) {
              let canFit = true;
              for (let c = seg.startCol; c <= seg.endCol; c++) {
                if (tracks[t][c]) {
                  canFit = false;
                  break;
                }
              }
              if (canFit) {
                assignedTrack = t;
                break;
              }
            }

            if (assignedTrack === -1) {
              assignedTrack = tracks.length;
              tracks.push(new Array(7).fill(false));
            }

            for (let c = seg.startCol; c <= seg.endCol; c++) {
              tracks[assignedTrack][c] = true;
            }

            if (assignedTrack < MAX_VISIBLE_TRACKS) {
              visibleSegments.push({
                ...seg,
                track: assignedTrack,
              });
            } else {
              for (let c = seg.startCol; c <= seg.endCol; c++) {
                overflowByCol[c]++;
              }
            }
          }

          return (
            <div key={`week-${weekIdx}`} className="relative">
              {/* Células base dos 7 dias da semana */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {weekDays.map((cell, colIdx) => {
                  const isSelected = cell.date === selectedDate;
                  const hiddenCount = overflowByCol[colIdx];
                  const isInDrag = activeDragRange
                    ? cell.date >= activeDragRange.start && cell.date <= activeDragRange.end
                    : false;

                  return (
                    <div
                      key={cell.date}
                      role="button"
                      tabIndex={0}
                      aria-label={`Dia ${cell.dayNumber}`}
                      onDoubleClick={() => onAddEventOnDate(cell.date, cell.date)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectDate(cell.date);
                        }
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        setIsDragging(true);
                        setDragStart(cell.date);
                        setDragHover(cell.date);
                      }}
                      onMouseEnter={() => {
                        if (isDragging) {
                          setDragHover(cell.date);
                        }
                      }}
                      className={`group relative min-h-[86px] sm:min-h-[104px] p-1.5 sm:p-2 rounded-lg border-2 border-ink transition-all cursor-pointer flex flex-col justify-between ${
                        !cell.isCurrentMonth
                          ? 'bg-neutral-100 dark:bg-neutral-50-dark'
                          : 'bg-paper'
                      } ${
                        isInDrag
                          ? 'ring-2 ring-neo-blue ring-offset-2 ring-offset-paper bg-pastel-blue/70 dark:bg-pastel-blue/40 shadow-[2px_2px_0px_0px_var(--neo-shadow)]'
                          : isSelected
                          ? 'ring-2 ring-neo-blue ring-offset-2 ring-offset-paper shadow-[2px_2px_0px_0px_var(--neo-shadow)]'
                          : 'hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_var(--neo-shadow)]'
                      }`}
                    >
                      {/* Topo da Célula: Dia + Indicador de Hoje + Botão rápido "+" */}
                      <div className="flex items-center justify-between mb-1">
                        {cell.isToday ? (
                          <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-neo-blue text-white font-black text-[11px] sm:text-xs flex items-center justify-center border border-ink shadow-[1px_1px_0px_0px_var(--neo-shadow)]">
                            {cell.dayNumber}
                          </span>
                        ) : (
                          <span
                            className={`font-black text-xs sm:text-sm ${
                              cell.isCurrentMonth ? 'text-black' : 'text-neutral-500'
                            }`}
                          >
                            {cell.dayNumber}
                          </span>
                        )}

                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddEventOnDate(cell.date, cell.date);
                          }}
                          title={`Adicionar evento em ${cell.date}`}
                          className="cursor-pointer opacity-0 group-hover:opacity-100 p-0.5 rounded-md border border-ink bg-chalk-green hover:bg-chalk-green-hover text-black shadow-[1px_1px_0px_0px_var(--neo-shadow)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                        >
                          <Plus className="w-3 h-3 stroke-[3]" />
                        </button>
                      </div>

                      {/* Espaçador central onde as trilhas de eventos repousam */}
                      <div className="h-[48px] sm:h-[52px]" />

                      {/* Rodapé da Célula: Overflow "+N mais" e indicador de prazo fatal */}
                      <div className="flex items-center justify-between min-h-[14px]">
                        {hiddenCount > 0 ? (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDate(cell.date);
                            }}
                            title={`Ver eventos do dia ${cell.dayNumber}`}
                            className="text-[11px] font-extrabold text-blue-ink hover:underline cursor-pointer leading-none text-left"
                          >
                            +{hiddenCount} mais
                          </button>
                        ) : (
                          <span />
                        )}

                        {cell.hasDeadline && (
                          <span
                            aria-label="Contém prazo importante"
                            title="Contém prazo ou trancamento importante"
                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-correction-red border border-ink ml-auto shrink-0"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Camada Superior de Blocos Lineares de Eventos Contínuos */}
              <div
                className="absolute top-[30px] sm:top-[34px] inset-x-0 grid grid-cols-7 gap-1.5 sm:gap-2 pointer-events-none"
                style={{
                  gridTemplateRows: 'repeat(2, 22px)',
                  rowGap: '4px',
                }}
              >
                {visibleSegments.map((seg) => {
                  const {
                    event,
                    startCol,
                    endCol,
                    isMultiDay,
                    startsBeforeWeek,
                    endsAfterWeek,
                    track,
                  } = seg;

                  const color = getCalendarEventColors(event);

                  // Bordas e raios para formar um bloco linear contínuo
                  const roundedClass = isMultiDay
                    ? `${startsBeforeWeek ? 'rounded-l-none' : 'rounded-l-md'} ${
                        endsAfterWeek ? 'rounded-r-none' : 'rounded-r-md'
                      }`
                    : 'rounded-md';

                  const borderClass = isMultiDay
                    ? `border-y-2 ${startsBeforeWeek ? 'border-l-0' : 'border-l-2'} ${
                        endsAfterWeek ? 'border-r-0' : 'border-r-2'
                      }`
                    : 'border-2';

                  // Margens para que eventos do mesmo dia nunca vazem da célula
                  const marginClass = isMultiDay
                    ? `${startsBeforeWeek ? 'ml-0' : 'ml-1.5 sm:ml-2'} ${
                        endsAfterWeek ? 'mr-0' : 'mr-1.5 sm:mr-2'
                      }`
                    : 'mx-1.5 sm:mx-2';

                  return (
                    <div
                      key={`${event.id}-${weekIdx}-${track}`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDate(event.date);
                        onEventClick?.(event);
                      }}
                      className={`pointer-events-auto h-[22px] min-w-0 px-1.5 ${roundedClass} ${borderClass} ${marginClass} ${color.border} ${color.bg} ${color.text} flex items-center gap-1 text-[11px] font-extrabold tracking-tight shadow-[1px_1px_0px_0px_var(--neo-shadow)] cursor-pointer hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all select-none overflow-hidden`}
                      style={{
                        gridColumn: `${startCol + 1} / ${endCol + 2}`,
                        gridRow: `${track + 1}`,
                      }}
                      title={`${event.title}${
                        event.endDate && event.endDate !== event.date
                          ? ` (Período: ${formatDateBR(event.date)} a ${formatDateBR(event.endDate)})`
                          : ''
                      }`}
                    >
                      {startsBeforeWeek && (
                        <span
                          className="text-[11px] opacity-75 font-black shrink-0"
                          title="Continuação da semana anterior"
                        >
                          ‹
                        </span>
                      )}

                      <span className="truncate leading-none">
                        {event.title}
                      </span>

                      {endsAfterWeek && (
                        <span
                          className="text-[11px] opacity-75 font-black ml-auto shrink-0"
                          title="Continua na próxima semana"
                        >
                          ›
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
