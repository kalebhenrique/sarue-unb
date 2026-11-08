import type { AcademicCalendar } from '../domain/entities/academic-calendar';
import type {
  CalendarEventCategory,
  UnifiedCalendarEvent,
  UserCalendarEvent,
} from '../domain/entities/user-calendar-event';
import type { IUserEventsRepository } from '../domain/interfaces/user-events-repo.interface';
import type { IFeedRepository } from '../domain/interfaces/feed-repo.interface';
import type { GetAcademicCalendarUseCase } from './get-academic-calendar.use-case';

export interface CalendarFilterOptions {
  year?: string;
  month?: number; // 1-12
  includeAcademic?: boolean;
  includeManual?: boolean;
  includeFeedTasks?: boolean;
}

const CATEGORY_LABELS: Record<CalendarEventCategory, string> = {
  exam: 'Prova',
  assignment: 'Trabalho / Entrega',
  class: 'Aula / Reposição',
  study: 'Estudo / Monitoria',
  meeting: 'Reunião',
  personal: 'Pessoal / Outro',
  academic: 'Oficial UnB',
};

const CATEGORY_BADGES: Record<CalendarEventCategory, UnifiedCalendarEvent['badgeVariant']> = {
  exam: 'green',
  assignment: 'green',
  class: 'green',
  study: 'green',
  meeting: 'green',
  personal: 'green',
  academic: 'blue',
};

export class GetUnifiedCalendarEventsUseCase {
  constructor(
    private readonly userEventsRepo: IUserEventsRepository,
    private readonly getAcademicCalendarUseCase: GetAcademicCalendarUseCase,
    private readonly feedRepo?: IFeedRepository,
  ) {}

  /**
   * Converte marcos do calendário oficial da UnB em eventos do calendário.
   */
  private extractAcademicEvents(calendars: AcademicCalendar[]): UnifiedCalendarEvent[] {
    const events: UnifiedCalendarEvent[] = [];

    for (const cal of calendars) {
      const sem = cal.semester || `${cal.year}.${cal.period}`;
      const pdfUrl = cal.pdfUrl;

      // 1. Início e Fim do Período Letivo (eventos pontuais de marco)
      if (cal.periodoLetivo?.inicio) {
        events.push({
          id: `acad_${sem}_letivo_ini`,
          type: 'academic',
          title: `Início do Período Letivo (${sem})`,
          description: `Primeiro dia letivo do semestre ${sem} de acordo com o calendário acadêmico da UnB.`,
          date: cal.periodoLetivo.inicio,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Oficial UnB',
          badgeVariant: 'blue',
          externalUrl: pdfUrl,
        });
      }

      if (cal.periodoLetivo?.fim && cal.periodoLetivo.fim !== cal.periodoLetivo.inicio) {
        events.push({
          id: `acad_${sem}_letivo_fim`,
          type: 'academic',
          title: `Término do Período Letivo (${sem})`,
          description: `Último dia letivo do semestre ${sem} na UnB.`,
          date: cal.periodoLetivo.fim,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Oficial UnB',
          badgeVariant: 'blue',
          externalUrl: pdfUrl,
        });
      }

      // 2. Primeiro e Último dia de Aulas (eventos pontuais de marco)
      if (cal.periodoAulas?.inicio) {
        events.push({
          id: `acad_${sem}_aulas_ini`,
          type: 'academic',
          title: `Início das Aulas (${sem})`,
          description: `Primeiro dia de aulas para os estudantes de graduação da UnB.`,
          date: cal.periodoAulas.inicio,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Aulas',
          badgeVariant: 'blue',
          externalUrl: pdfUrl,
        });
      }

      if (cal.periodoAulas?.fim && cal.periodoAulas.fim !== cal.periodoAulas.inicio) {
        events.push({
          id: `acad_${sem}_aulas_fim`,
          type: 'academic',
          title: `Último Dia de Aulas (${sem})`,
          description: `Encerramento das atividades de sala de aula e aulas regulares do semestre.`,
          date: cal.periodoAulas.fim,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Aulas',
          badgeVariant: 'blue',
          externalUrl: pdfUrl,
        });
      }

      // 3. Matrícula Web (SIGAA)
      if (cal.periodoMatricula?.inicio) {
        events.push({
          id: `acad_${sem}_matricula`,
          type: 'academic',
          title: `Solicitação de Matrícula (${sem})`,
          description: `Período para solicitação de matrícula no SIGAA (${cal.periodoMatricula.raw || `${cal.periodoMatricula.inicio} a ${cal.periodoMatricula.fim}`}).`,
          date: cal.periodoMatricula.inicio,
          endDate: cal.periodoMatricula.fim,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Matrícula',
          badgeVariant: 'blue',
          isDeadline: true,
          externalUrl: pdfUrl,
        });
      }

      // 4. Rematrícula
      if (cal.periodoRematricula?.inicio) {
        events.push({
          id: `acad_${sem}_rematricula`,
          type: 'academic',
          title: `Solicitação de Rematrícula (${sem})`,
          description: `Período para rematrícula e ajuste de turmas no SIGAA.`,
          date: cal.periodoRematricula.inicio,
          endDate: cal.periodoRematricula.fim,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Matrícula',
          badgeVariant: 'blue',
          isDeadline: true,
          externalUrl: pdfUrl,
        });
      }

      // 5. Matrícula Extraordinária
      if (cal.periodoMatriculaExtraordinaria?.inicio) {
        events.push({
          id: `acad_${sem}_extraordinaria`,
          type: 'academic',
          title: `Matrícula Extraordinária (${sem})`,
          description: `Ajuste extraordinário de matrícula diretamente no SIGAA.`,
          date: cal.periodoMatriculaExtraordinaria.inicio,
          endDate: cal.periodoMatriculaExtraordinaria.fim,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Matrícula',
          badgeVariant: 'blue',
          isDeadline: true,
          externalUrl: pdfUrl,
        });
      }

      // 6. Retirada de Disciplinas
      if (cal.periodoRetirada?.inicio) {
        events.push({
          id: `acad_${sem}_retirada`,
          type: 'academic',
          title: `Retirada de Disciplinas (${sem})`,
          description: `Prazo para solicitar retirada de disciplinas no SIGAA sem constar reprovação.`,
          date: cal.periodoRetirada.inicio,
          endDate: cal.periodoRetirada.fim,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Retirada',
          badgeVariant: 'blue',
          isDeadline: true,
          externalUrl: pdfUrl,
        });
      }

      // 7. Trancamento Parcial (Data Fatal)
      if (cal.periodoTrancamentoParcial?.limite) {
        events.push({
          id: `acad_${sem}_tranc_parcial`,
          type: 'academic',
          title: `Limite Trancamento Parcial (${sem})`,
          description: `Último dia para trancamento parcial de matrícula automático no SIGAA (uma disciplina).`,
          date: cal.periodoTrancamentoParcial.limite,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Trancamento',
          badgeVariant: 'blue',
          isDeadline: true,
          externalUrl: pdfUrl,
        });
      }

      // 8. Trancamento Geral (Data Fatal)
      if (cal.periodoTrancamentoGeral?.limite) {
        events.push({
          id: `acad_${sem}_tranc_geral`,
          type: 'academic',
          title: `Limite Trancamento Geral (${sem})`,
          description: `Último dia para trancamento geral (total) de matrícula automático pelo estudante.`,
          date: cal.periodoTrancamentoGeral.limite,
          allDay: true,
          category: 'academic',
          categoryLabel: 'Trancamento',
          badgeVariant: 'blue',
          isDeadline: true,
          externalUrl: pdfUrl,
        });
      }
    }

    return events;
  }

  private mapUserEvent(evt: UserCalendarEvent): UnifiedCalendarEvent {
    return {
      id: evt.id,
      type: 'manual',
      title: evt.title,
      description: evt.description,
      date: evt.date,
      endDate: evt.endDate,
      startTime: evt.startTime,
      endTime: evt.endTime,
      allDay: evt.allDay,
      category: evt.category,
      categoryLabel: CATEGORY_LABELS[evt.category] || 'Evento',
      badgeVariant: CATEGORY_BADGES[evt.category] || 'blue',
      courseName: evt.courseName,
      courseCode: evt.courseCode,
      location: evt.location,
      notify: evt.notify,
      isCompleted: evt.isCompleted,
      rawPayload: evt,
    };
  }

  async execute(options: CalendarFilterOptions = {}): Promise<UnifiedCalendarEvent[]> {
    const {
      includeAcademic = true,
      includeManual = true,
      includeFeedTasks = true,
    } = options;

    const results: UnifiedCalendarEvent[] = [];

    // 1. Calendário acadêmico público
    if (includeAcademic) {
      try {
        const calendars = await this.getAcademicCalendarUseCase.execute();
        const academicEvents = this.extractAcademicEvents(calendars);
        results.push(...academicEvents);
      } catch (e) {
        console.warn('[GetUnifiedCalendarEventsUseCase] Falha ao extrair eventos acadêmicos:', e);
      }
    }

    // 2. Eventos manuais inseridos pelo estudante
    if (includeManual) {
      try {
        const manualEvents = await this.userEventsRepo.getEvents();
        results.push(...manualEvents.map((evt) => this.mapUserEvent(evt)));
      } catch (e) {
        console.warn('[GetUnifiedCalendarEventsUseCase] Falha ao carregar eventos manuais:', e);
      }
    }

    // 3. Tarefas com prazo do feed (SIGAA / Aprender 3 / Teams)
    if (includeFeedTasks && this.feedRepo) {
      try {
        const feedItems = await this.feedRepo.getItems();
        for (const item of feedItems) {
          if (item.itemType !== 'assignment' || !item.dueDate) continue;

          const datePart = item.dueDate.split('T')[0];
          let timePart: string | undefined;
          if (item.dueDate.includes('T')) {
            const timeRaw = item.dueDate.split('T')[1]?.substring(0, 5);
            if (timeRaw && timeRaw !== '00:00' && timeRaw !== '23:59') {
              timePart = timeRaw;
            }
          }

          results.push({
            id: `task_${item.id}`,
            type: 'feed_task',
            title: item.title,
            description: item.content,
            date: datePart,
            startTime: timePart,
            allDay: !timePart,
            category: 'assignment',
            categoryLabel: `Tarefa • ${item.platform.toUpperCase()}`,
            badgeVariant: 'yellow',
            courseName: item.courseName,
            courseCode: item.courseCode,
            isCompleted: item.isCompleted,
            isDeadline: true,
            externalUrl: item.externalUrl,
            rawPayload: item,
          });
        }
      } catch (e) {
        console.warn('[GetUnifiedCalendarEventsUseCase] Falha ao carregar tarefas do feed:', e);
      }
    }

    // Ordenação cronológica por data e hora
    results.sort((a, b) => {
      const cmpDate = a.date.localeCompare(b.date);
      if (cmpDate !== 0) return cmpDate;
      const timeA = a.startTime || (a.allDay ? '00:00' : '23:59');
      const timeB = b.startTime || (b.allDay ? '00:00' : '23:59');
      return timeA.localeCompare(timeB);
    });

    return results;
  }
}
