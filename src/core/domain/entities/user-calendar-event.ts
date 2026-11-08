export type CalendarEventCategory =
  | 'exam'        // Provas e avaliações (Vermelho)
  | 'assignment'  // Trabalhos e entregas (Amarelo)
  | 'class'       // Aulas, palestras e reposições (Azul)
  | 'study'       // Grupos de estudo e monitoria (Lilás)
  | 'meeting'     // Reuniões e orientações (Laranja)
  | 'personal'    // Compromissos pessoais / outros (Verde)
  | 'academic';   // Datas oficiais da UnB (Institucional)

export interface UserCalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;          // ISO "YYYY-MM-DD"
  endDate?: string;      // ISO "YYYY-MM-DD" (opcional para eventos que duram dias)
  startTime?: string;    // "HH:MM" (opcional)
  endTime?: string;      // "HH:MM" (opcional)
  allDay: boolean;
  category: CalendarEventCategory;
  courseId?: string;     // ID do curso no sistema (opcional)
  courseCode?: string;   // Código da matéria, ex.: "CIC0004" (opcional)
  courseName?: string;   // Nome da disciplina, ex.: "Algoritmos" (opcional)
  location?: string;     // Sala ou link virtual (opcional)
  notify?: boolean;      // Notificar sobre este evento (padrão true)
  isCompleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UnifiedCalendarEventType = 'academic' | 'manual' | 'feed_task';

export interface UnifiedCalendarEvent {
  id: string;
  type: UnifiedCalendarEventType;
  title: string;
  description?: string;
  date: string;          // ISO "YYYY-MM-DD"
  endDate?: string;      // ISO "YYYY-MM-DD"
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  category: CalendarEventCategory;
  categoryLabel: string;
  badgeVariant: 'blue' | 'yellow' | 'green' | 'red' | 'purple' | 'orange' | 'neutral';
  courseName?: string;
  courseCode?: string;
  location?: string;
  notify?: boolean;
  isCompleted?: boolean;
  isDeadline?: boolean;  // Se é prazo fatal de sistema ou trancamento
  externalUrl?: string;  // Link oficial (PDF SAA ou link no Aprender/SIGAA)
  rawPayload?: unknown;
}
