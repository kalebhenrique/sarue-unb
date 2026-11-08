import React from 'react';
import { Calendar as CalendarIcon, Clock, Edit3, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { UnifiedCalendarEvent, UserCalendarEvent } from '@/core';
import { getCalendarEventColors } from './calendar-colors';

export interface CalendarEventCardProps {
  event: UnifiedCalendarEvent;
  onEditEvent?: (event: UserCalendarEvent | UnifiedCalendarEvent) => void;
  onDeleteEvent?: (event: UnifiedCalendarEvent) => void;
  /** Exibe a linha de data (DD/MM). Omitir no painel lateral do dia selecionado para evitar ruído. */
  showDate?: boolean;
  /** Adiciona sombra ao card (padrão false para cards internos em painéis) */
  hasShadow?: boolean;
}

/**
 * Card padronizado de evento de calendário (UnB Oficial, Tarefa do Feed ou Meu Evento).
 * Compartilhado entre a Agenda do Dia (painel lateral) e a Agenda Completa (linha do tempo).
 */
export const CalendarEventCard: React.FC<CalendarEventCardProps> = ({
  event,
  onEditEvent,
  onDeleteEvent,
  showDate = true,
  hasShadow = false,
}) => {
  const isManual = event.type === 'manual';
  const isCompleted = Boolean(event.isCompleted);
  const color = getCalendarEventColors(event);

  const formatDateBR = (iso: string) => {
    const parts = iso.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return iso;
  };

  // Exibição humana da disciplina: nome legível em vez de código em pill mono
  const courseDisplay = event.courseName || event.courseCode;

  return (
    <div
      onClick={() => {
        if (onEditEvent) {
          onEditEvent(isManual && event.rawPayload ? (event.rawPayload as UserCalendarEvent) : event);
        }
      }}
      className={`p-3 rounded-lg border-2 ${color.border} ${color.bg} transition-all ${
        onEditEvent ? 'cursor-pointer hover:border-black/50' : ''
      } ${hasShadow ? 'shadow-[2px_2px_0px_0px_var(--neo-shadow)]' : ''} ${
        isCompleted ? 'opacity-50' : ''
      }`}
    >
      {/* Linha de Badges e Ações */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant={color.badgeVariant} size="sm" className="font-black">
            {color.label}
          </Badge>

          {event.categoryLabel && (
            <Badge variant="neutral" size="sm" className="font-bold">
              {event.categoryLabel}
            </Badge>
          )}

          {courseDisplay && (
            <span className="text-xs font-bold text-neutral-700 truncate max-w-[200px]" title={courseDisplay}>
              {courseDisplay}
            </span>
          )}
        </div>

        {/* Ações para eventos manuais com física inteira neo e cursor-pointer */}
        {isManual && (
          <div className="flex items-center gap-1 shrink-0">
            {onEditEvent && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditEvent(event.rawPayload as UserCalendarEvent);
                }}
                title="Editar evento"
                className="cursor-pointer p-1 rounded-md border border-ink bg-paper hover:bg-neutral-100 text-black shadow-[1px_1px_0px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
              >
                <Edit3 className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
            {onDeleteEvent && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEvent(event);
                }}
                title="Excluir evento"
                className="cursor-pointer p-1 rounded-md border border-ink bg-paper hover:bg-correction-red/20 text-neutral-800 hover:text-correction-red-strong shadow-[1px_1px_0px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
              >
                <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Título do Evento e Detalhes */}
      <div className="space-y-1.5">
        <h3 className="text-sm font-extrabold text-black leading-snug break-words">
          {event.title}
        </h3>

        {/* Informações de Período / Horário */}
        {(showDate || (event.startTime && !event.allDay)) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-800 font-bold">
            {showDate && (
              <div className="flex items-center gap-1.5">
                <CalendarIcon className={`w-3.5 h-3.5 stroke-[2.5] ${color.accentText}`} />
                <span>
                  {event.endDate && event.endDate !== event.date ? (
                    <>
                      Período:{' '}
                      <strong className="font-extrabold text-black">
                        {formatDateBR(event.date)} a {formatDateBR(event.endDate)}
                      </strong>
                    </>
                  ) : (
                    <strong className="font-extrabold text-black">
                      {formatDateBR(event.date)}
                    </strong>
                  )}
                </span>
              </div>
            )}

            {event.startTime && !event.allDay && (
              <div className="flex items-center gap-1">
                <Clock className={`w-3.5 h-3.5 stroke-[2.5] ${color.accentText}`} />
                <span className="text-black font-extrabold">
                  {event.startTime}
                  {event.endTime ? ` às ${event.endTime}` : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Descrição oficial (quando disponível) */}
        {event.description && (
          <p className="text-xs text-neutral-800 leading-relaxed font-medium bg-paper/85 p-2 rounded-lg border border-ink/15">
            {event.description}
          </p>
        )}
      </div>
    </div>
  );
};
