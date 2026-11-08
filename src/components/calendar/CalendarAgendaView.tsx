import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import type { UnifiedCalendarEvent, UserCalendarEvent } from '@/core';
import { CalendarEventCard } from './CalendarEventCard';

interface CalendarAgendaViewProps {
  events: UnifiedCalendarEvent[];
  onAddEvent: () => void;
  onEditEvent: (event: UserCalendarEvent | UnifiedCalendarEvent) => void;
  onDeleteEvent: (event: UnifiedCalendarEvent) => void;
}

export const CalendarAgendaView: React.FC<CalendarAgendaViewProps> = ({
  events,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Agrupa eventos por data e divide entre futuros/hoje e passados (ordem presente -> futuro)
  const { upcomingGroups, pastGroups } = useMemo(() => {
    const map = new Map<string, UnifiedCalendarEvent[]>();
    for (const evt of events) {
      const list = map.get(evt.date) || [];
      list.push(evt);
      map.set(evt.date, list);
    }

    const all = Array.from(map.entries());
    const upcoming = all
      .filter(([date]) => date >= todayStr)
      .sort(([a], [b]) => a.localeCompare(b));
    const past = all
      .filter(([date]) => date < todayStr)
      .sort(([a], [b]) => b.localeCompare(a)); // Passado mais recente primeiro

    return { upcomingGroups: upcoming, pastGroups: past };
  }, [events, todayStr]);

  // Se não houver eventos futuros, abre o passado automaticamente
  const [showPast, setShowPast] = useState<boolean>(() => upcomingGroups.length === 0);

  const formatDateHeader = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    const month = dateObj.toLocaleDateString('pt-BR', { month: 'long' });

    let relativeBadge: string | null = null;
    if (dateStr === todayStr) {
      relativeBadge = 'Hoje';
    } else {
      const now = new Date();
      const diffTime =
        dateObj.getTime() -
        new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 1) relativeBadge = 'Amanhã';
      else if (diffDays === -1) relativeBadge = 'Ontem';
      else if (diffDays > 1 && diffDays <= 7) relativeBadge = `Em ${diffDays} dias`;
    }

    return {
      title: `${d} de ${month} de ${y}`,
      weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
      relativeBadge,
    };
  };

  const renderGroup = ([dateStr, items]: [string, UnifiedCalendarEvent[]]) => {
    const headerInfo = formatDateHeader(dateStr);
    const isToday = dateStr === todayStr;

    return (
      <div
        key={dateStr}
        className="bg-paper border-2 border-ink rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_var(--neo-shadow)] transition-all"
      >
        {/* Header da Data */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-black/10 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-canvas border-2 border-ink flex items-center justify-center font-black text-xs text-black shadow-[1px_1px_0px_0px_var(--neo-shadow)]">
              {dateStr.split('-')[2]}
            </div>
            <div>
              <h3 className="text-base font-black text-black tracking-tight leading-none">
                {headerInfo.title}
              </h3>
              <span className="text-xs font-bold text-neutral-500 block mt-0.5">
                {headerInfo.weekday}
              </span>
            </div>
          </div>

          {headerInfo.relativeBadge && (
            <Badge
              variant={isToday ? 'yellow' : 'primary'}
              size="sm"
              className="font-black uppercase"
            >
              {headerInfo.relativeBadge}
            </Badge>
          )}
        </div>

        {/* Lista de Eventos do Grupo */}
        <div className="space-y-3">
          {items.map((evt) => (
            <CalendarEventCard
              key={evt.id}
              event={evt}
              onEditEvent={onEditEvent}
              onDeleteEvent={onDeleteEvent}
              showDate
              hasShadow={false}
            />
          ))}
        </div>
      </div>
    );
  };

  if (events.length === 0) {
    return (
      <div className="bg-paper border-2 border-ink rounded-xl p-8 text-center shadow-[4px_4px_0px_0px_var(--neo-shadow)]">
        <div className="w-16 h-16 rounded-xl bg-canvas border-2 border-ink flex items-center justify-center mx-auto mb-4 shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
          <CalendarIcon className="w-8 h-8 text-neutral-500 stroke-[2.5]" />
        </div>
        <h3 className="text-lg font-black text-black">Nenhum evento encontrado</h3>
        <p className="text-sm font-medium text-neutral-600 mt-1 max-w-sm mx-auto">
          Tente ajustar os filtros ou insira um novo evento manual no calendário.
        </p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onAddEvent}
          className="mt-4 font-black cursor-pointer"
        >
          + Adicionar Primeiro Evento
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Eventos Futuros e de Hoje (prioridade de varredura) */}
      {upcomingGroups.length > 0 ? (
        upcomingGroups.map(renderGroup)
      ) : (
        <div className="p-4 rounded-xl border-2 border-dashed border-ink/20 bg-paper/50 text-center text-xs font-bold text-neutral-600">
          Nenhum evento futuro agendado.
        </div>
      )}

      {/* Seção Colapsável de Eventos Anteriores (passado) */}
      {pastGroups.length > 0 && (
        <div className="pt-2 border-t-2 border-black/10">
          <button
            type="button"
            onClick={() => setShowPast((prev) => !prev)}
            className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-ink bg-canvas hover:bg-neutral-200 dark:hover:bg-neutral-300 font-black text-xs text-black cursor-pointer shadow-[2px_2px_0px_0px_var(--neo-shadow)] transition-all"
          >
            <span>
              {showPast ? 'Ocultar' : 'Ver'} eventos anteriores ({pastGroups.length}{' '}
              {pastGroups.length === 1 ? 'dia' : 'dias'})
            </span>
            {showPast ? (
              <ChevronUp className="w-4 h-4 stroke-[2.5]" />
            ) : (
              <ChevronDown className="w-4 h-4 stroke-[2.5]" />
            )}
          </button>

          {showPast && (
            <div className="space-y-6 mt-4">
              {pastGroups.map(renderGroup)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
