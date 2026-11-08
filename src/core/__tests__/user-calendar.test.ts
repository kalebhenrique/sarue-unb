import { describe, it, expect, beforeEach } from 'vitest';
import {
  ManageUserEventsUseCase,
  GetUnifiedCalendarEventsUseCase,
  GetAcademicCalendarUseCase,
  type AcademicCalendar,
} from '@/core';
import { InMemoryUserEventsRepository } from '../infrastructure/in-memory-user-events.repo';
import { InMemoryFeedRepository } from '../infrastructure/in-memory-feed.repo';

describe('User Calendar & Unified Events Use Cases', () => {
  let userEventsRepo: InMemoryUserEventsRepository;
  let manageUserEvents: ManageUserEventsUseCase;
  let feedRepo: InMemoryFeedRepository;
  let getAcademicCalendar: GetAcademicCalendarUseCase;
  let getUnifiedEvents: GetUnifiedCalendarEventsUseCase;

  const mockCalendar: AcademicCalendar = {
    semester: '2026.2',
    year: '2026',
    period: '2',
    label: '2026 • 2º semestre',
    isCurrent: true,
    periodoLetivo: {
      inicio: '2026-07-22',
      fim: '2026-12-19',
      raw: '22/07 a 19/12/2026',
    },
    periodoAulas: {
      inicio: '2026-08-10',
      fim: '2026-12-14',
      raw: '10/08 a 14/12/2026',
    },
    periodoMatricula: {
      inicio: '2026-07-27',
      fim: '2026-07-29',
      raw: '27/07 a 29/07/2026',
    },
    periodoTrancamentoParcial: {
      limite: '2026-10-09',
      raw: 'Até 09/10/2026',
    },
    periodoTrancamentoGeral: {
      limite: '2026-11-12',
      raw: 'Até 12/11/2026',
    },
  };

  beforeEach(() => {
    userEventsRepo = new InMemoryUserEventsRepository();
    manageUserEvents = new ManageUserEventsUseCase(userEventsRepo);
    feedRepo = new InMemoryFeedRepository();
    getAcademicCalendar = new GetAcademicCalendarUseCase([mockCalendar]);
    getUnifiedEvents = new GetUnifiedCalendarEventsUseCase(
      userEventsRepo,
      getAcademicCalendar,
      feedRepo,
    );
  });

  describe('ManageUserEventsUseCase', () => {
    it('deve criar um novo evento manual com dados válidos', async () => {
      const created = await manageUserEvents.createEvent({
        title: 'Prova 1 de Cálculo 1',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '12:00',
        category: 'exam',
        courseName: 'Cálculo 1',
        location: 'ICC Ala Sul - Sala AT-03',
      });

      expect(created.id).toBeDefined();
      expect(created.title).toBe('Prova 1 de Cálculo 1');
      expect(created.date).toBe('2026-09-15');
      expect(created.category).toBe('exam');
      expect(created.isCompleted).toBe(false);
      expect(created.notify).toBe(true);

      const list = await manageUserEvents.getEvents();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(created.id);
      expect(list[0].notify).toBe(true);
    });

    it('deve permitir desativar a notificação do evento', async () => {
      const created = await manageUserEvents.createEvent({
        title: 'Compromisso sem notificação',
        date: '2026-09-18',
        category: 'personal',
        notify: false,
      });

      expect(created.notify).toBe(false);

      const updated = await manageUserEvents.updateEvent({
        id: created.id,
        title: 'Compromisso com notificação reativada',
        date: '2026-09-18',
        category: 'personal',
        notify: true,
      });

      expect(updated.notify).toBe(true);
    });

    it('deve rejeitar evento com título vazio', async () => {
      await expect(
        manageUserEvents.createEvent({
          title: '   ',
          date: '2026-09-15',
          category: 'personal',
        }),
      ).rejects.toThrow('O título do evento não pode ser vazio.');
    });

    it('deve alternar o status de conclusão do evento', async () => {
      const event = await manageUserEvents.createEvent({
        title: 'Entregar trabalho de IA',
        date: '2026-10-05',
        category: 'assignment',
      });

      expect(event.isCompleted).toBe(false);
      await manageUserEvents.toggleCompleted(event.id);

      const fetched = await manageUserEvents.getEventById(event.id);
      expect(fetched?.isCompleted).toBe(true);

      await manageUserEvents.toggleCompleted(event.id);
      const fetchedAgain = await manageUserEvents.getEventById(event.id);
      expect(fetchedAgain?.isCompleted).toBe(false);
    });

    it('deve editar e excluir eventos corretamente', async () => {
      const event = await manageUserEvents.createEvent({
        title: 'Reunião de Grupo',
        date: '2026-09-20',
        category: 'meeting',
      });

      const updated = await manageUserEvents.updateEvent({
        id: event.id,
        title: 'Reunião de Grupo - TCC',
        date: '2026-09-21',
        category: 'meeting',
        location: 'Biblioteca Central (BCE)',
      });

      expect(updated.title).toBe('Reunião de Grupo - TCC');
      expect(updated.date).toBe('2026-09-21');
      expect(updated.location).toBe('Biblioteca Central (BCE)');

      await manageUserEvents.deleteEvent(event.id);
      const list = await manageUserEvents.getEvents();
      expect(list).toHaveLength(0);
    });
  });

  describe('GetUnifiedCalendarEventsUseCase', () => {
    it('deve unificar marcos do calendário acadêmico oficial com eventos manuais', async () => {
      // Cria evento manual
      await manageUserEvents.createEvent({
        title: 'Apresentação de Projeto',
        date: '2026-10-15',
        category: 'assignment',
      });

      const unified = await getUnifiedEvents.execute();

      // Marcos acadêmicos esperados:
      // Início Período Letivo, Fim Período Letivo, Início Aulas, Fim Aulas, Matrícula, Trancamento Parcial, Trancamento Geral
      const academicEvents = unified.filter((e) => e.type === 'academic');
      expect(academicEvents.length).toBeGreaterThanOrEqual(6);

      const trancamento = academicEvents.find((e) => e.id.includes('tranc_geral'));
      expect(trancamento).toBeDefined();
      expect(trancamento?.date).toBe('2026-11-12');
      expect(trancamento?.isDeadline).toBe(true);

      // Início do Período Letivo e Início das Aulas são marcos pontuais (sem endDate prolongado)
      const inicioLetivo = academicEvents.find((e) => e.id.includes('letivo_ini'));
      expect(inicioLetivo).toBeDefined();
      expect(inicioLetivo?.endDate).toBeUndefined();

      const inicioAulas = academicEvents.find((e) => e.id.includes('aulas_ini'));
      expect(inicioAulas).toBeDefined();
      expect(inicioAulas?.endDate).toBeUndefined();

      // Evento manual presente
      const manualEvents = unified.filter((e) => e.type === 'manual');
      expect(manualEvents).toHaveLength(1);
      expect(manualEvents[0].title).toBe('Apresentação de Projeto');
    });

    it('deve respeitar os filtros de categoria e inclusão', async () => {
      await manageUserEvents.createEvent({
        title: 'Estudo para P2',
        date: '2026-10-10',
        category: 'study',
      });

      const withoutAcademic = await getUnifiedEvents.execute({
        includeAcademic: false,
        includeManual: true,
        includeFeedTasks: false,
      });

      expect(withoutAcademic).toHaveLength(1);
      expect(withoutAcademic[0].type).toBe('manual');

      const onlyAcademic = await getUnifiedEvents.execute({
        includeAcademic: true,
        includeManual: false,
        includeFeedTasks: false,
      });

      expect(onlyAcademic.every((e) => e.type === 'academic')).toBe(true);
    });
  });
});
