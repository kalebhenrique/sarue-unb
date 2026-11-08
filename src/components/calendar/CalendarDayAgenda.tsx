import React from 'react';
import { Calendar as CalendarIcon, Plus } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import type { UnifiedCalendarEvent, UserCalendarEvent } from '@/core';
import { CalendarEventCard } from './CalendarEventCard';

interface CalendarDayAgendaProps {
  selectedDate: string; // ISO "YYYY-MM-DD"
  events: UnifiedCalendarEvent[];
  onAddEvent: (date: string) => void;
  onEditEvent: (event: UserCalendarEvent | UnifiedCalendarEvent) => void;
  onDeleteEvent: (event: UnifiedCalendarEvent) => void;
}

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const WEEKDAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export const CalendarDayAgenda: React.FC<CalendarDayAgendaProps> = ({
  selectedDate,
  events,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
}) => {
  const [yearStr, monthStr, dayStr] = selectedDate.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr) - 1;
  const d = Number(dayStr);
  const dateObj = new Date(y, m, d);

  const weekday = WEEKDAY_NAMES[dateObj.getDay()];
  const monthName = MONTH_NAMES[m];

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayStr;

  return (
    <div className="bg-paper border-2 border-ink rounded-xl p-4 shadow-[4px_4px_0px_0px_var(--neo-shadow)] flex flex-col h-full min-h-[480px]">
      {/* Cabeçalho do Dia Selecionado */}
      <div className="flex items-start justify-between gap-2 pb-4 border-b-2 border-black/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-neo-blue">
              {weekday}
            </span>
            {isToday && (
              <Badge variant="yellow" size="sm" className="font-black uppercase">
                Hoje
              </Badge>
            )}
          </div>
          <h2 className="text-xl font-black text-black tracking-tight mt-0.5">
            {d} de {monthName} <span className="text-neutral-500 font-bold">{y}</span>
          </h2>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAddEvent(selectedDate)}
          className="cursor-pointer flex items-center gap-1 text-xs font-black shrink-0"
          title="Adicionar evento neste dia"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>Adicionar</span>
        </Button>
      </div>

      {/* Lista de Eventos do Dia */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-6 h-full min-h-[220px] rounded-xl border-2 border-dashed border-ink/20 bg-canvas/40">
            <div className="w-12 h-12 rounded-xl bg-paper border-2 border-ink flex items-center justify-center mb-3 shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
              <CalendarIcon className="w-6 h-6 text-neutral-400 stroke-[2.5]" />
            </div>
            <p className="font-extrabold text-sm text-black">Nenhum evento neste dia</p>
            <p className="text-xs text-neutral-600 mt-1 max-w-[200px]">
              Insira uma prova, trabalho, monitoria ou compromisso pessoal.
            </p>
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => onAddEvent(selectedDate)}
              className="mt-4 font-black text-xs cursor-pointer"
            >
              + Adicionar Evento
            </Button>
          </div>
        ) : (
          events.map((evt) => (
            <CalendarEventCard
              key={evt.id}
              event={evt}
              onEditEvent={onEditEvent}
              onDeleteEvent={onDeleteEvent}
              showDate={false}
              hasShadow={false}
            />
          ))
        )}
      </div>
    </div>
  );
};
