import type { UnifiedCalendarEvent, CalendarEventCategory } from '@/core';
import type { BadgeTypeVariant } from '@/components/ui/badge';

export interface CalendarEventColorStyle {
  bg: string;
  border: string;
  text: string;
  accentText: string;
  badgeVariant: BadgeTypeVariant;
  hex: string;
  label: string;
}

export function getCalendarEventColors(evt: {
  type: UnifiedCalendarEvent['type'];
  category?: CalendarEventCategory;
  isDeadline?: boolean;
}): CalendarEventColorStyle {
  // Cores por tipo primário de evento:
  // academic (Oficial UnB) -> Azul Caneta Ação (texto branco permitido) ou Azul Marca
  // manual (Meu Evento) -> Verde Giz (texto preto tinta)
  // feed_task (Tarefas do Feed) -> Amarelo Marca-Texto (texto preto tinta)
  switch (evt.type) {
    case 'academic':
      return {
        bg: 'bg-pastel-blue',
        border: 'border-[#468AFB]',
        text: 'text-ink-disc-blue',
        accentText: 'text-blue-ink',
        badgeVariant: 'primary',
        hex: '#468AFB',
        label: 'UnB Oficial',
      };
    case 'feed_task':
      return {
        bg: 'bg-pastel-yellow',
        border: 'border-[#EAB308]',
        text: 'text-ink-disc-yellow',
        accentText: 'text-ink-disc-yellow',
        badgeVariant: 'yellow',
        hex: '#EAB308',
        label: 'Tarefa do Feed',
      };
    case 'manual':
    default:
      return {
        bg: 'bg-pastel-green',
        border: 'border-[#16A34A]',
        text: 'text-ink-disc-green',
        accentText: 'text-ink-disc-green',
        badgeVariant: 'success',
        hex: '#16A34A',
        label: 'Meu Evento',
      };
  }
}
