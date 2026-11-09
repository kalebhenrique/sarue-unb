import { useState, useEffect, useCallback, useMemo } from 'react';
import { useContainer } from '@/context/ContainerContext';
import {
  type UnifiedCalendarEvent,
  type UserCalendarEvent,
  type CalendarEventCategory,
  type AcademicCalendar,
  type Course,
  type Discipline,
  type CreateUserEventDTO,
  type UpdateUserEventDTO,
} from '@/core';
import { subscribeToFeedUpdates } from '@/hooks/useFeed';
import { toast } from '@/components/ui';

export type CalendarViewMode = 'month' | 'agenda';

export function getLocalTodayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface CalendarDayCell {
  date: string; // ISO "YYYY-MM-DD"
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: UnifiedCalendarEvent[];
  hasAcademic: boolean;
  hasDeadline: boolean;
  hasManual: boolean;
  hasFeedTask: boolean;
}

export function useCalendar() {
  const { useCases } = useContainer();

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalTodayIso());

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

  // Filtros
  const [showAcademic, setShowAcademic] = useState(true);
  const [showManual, setShowManual] = useState(true);
  const [showFeedTasks, setShowFeedTasks] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dados
  const [events, setEvents] = useState<UnifiedCalendarEvent[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [academicCalendar, setAcademicCalendar] = useState<AcademicCalendar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Modal de criação/edição
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<
    (UserCalendarEvent & { isReadOnly?: boolean }) | null
  >(null);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined);
  const [prefilledEndDate, setPrefilledEndDate] = useState<string | undefined>(undefined);

  // Modal de exclusão
  const [eventToDelete, setEventToDelete] = useState<UnifiedCalendarEvent | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [allEvents, disciplinesResult, calendars] = await Promise.all([
        useCases.getUnifiedCalendarEvents.execute({
          includeAcademic: true,
          includeManual: true,
          includeFeedTasks: true,
        }),
        useCases.getCourses.getDisciplines(),
        useCases.getAcademicCalendar.execute(),
      ]);

      // Constrói mapa de turmas associadas (Aprender 3 / Teams) -> Disciplina oficial (SIGAA)
      const aliasToDiscipline = new Map<string, { code: string; name: string }>();
      for (const d of disciplinesResult.disciplines) {
        const canonical = { code: d.code, name: d.name };
        if (d.code) aliasToDiscipline.set(d.code.trim().toUpperCase(), canonical);
        if (d.name) aliasToDiscipline.set(d.name.trim().toUpperCase(), canonical);
        for (const ac of d.aprenderCourses) {
          if (ac.code) aliasToDiscipline.set(ac.code.trim().toUpperCase(), canonical);
          if (ac.name) aliasToDiscipline.set(ac.name.trim().toUpperCase(), canonical);
        }
        for (const tc of d.teamsCourses ?? []) {
          if (tc.code) aliasToDiscipline.set(tc.code.trim().toUpperCase(), canonical);
          if (tc.name) aliasToDiscipline.set(tc.name.trim().toUpperCase(), canonical);
        }
      }

      const normalizedEvents = allEvents.map((evt) => {
        if (evt.type !== 'feed_task') return evt;
        const byName = evt.courseName ? aliasToDiscipline.get(evt.courseName.trim().toUpperCase()) : undefined;
        const byCode = evt.courseCode ? aliasToDiscipline.get(evt.courseCode.trim().toUpperCase()) : undefined;
        const resolved = byName ?? byCode;
        if (!resolved) return evt;
        return {
          ...evt,
          courseCode: resolved.code,
          courseName: resolved.name,
        };
      });

      const unifiedCourses: Course[] = [
        ...disciplinesResult.disciplines.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          semester: d.semester,
          platform: d.sigaaCourse?.platform ?? 'sigaa',
          professor: d.professor,
          classroom: d.classroom,
          schedule: d.schedule,
          turma: d.turma,
          url: d.url,
          unreadCount: d.unreadCount,
          pendingAssignmentsCount: d.pendingAssignmentsCount,
        })),
        ...disciplinesResult.unmatchedCourses,
        ...disciplinesResult.otherCourses,
      ];

      setEvents(normalizedEvents);
      setDisciplines(disciplinesResult.disciplines);
      setCourses(unifiedCourses);

      if (calendars.length > 0) {
        const current = calendars.find((c) => c.isCurrent) || calendars[0];
        setAcademicCalendar(current);
      }
    } catch (err) {
      console.error('Falha ao carregar dados do calendário:', err);
      toast.add({
        title: 'Erro ao carregar calendário',
        description: 'Não foi possível carregar os eventos. Tente novamente.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [useCases]);

  useEffect(() => {
    loadData();
    return subscribeToFeedUpdates(() => {
      void loadData();
    });
  }, [loadData]);

  // Navegação no tempo
  const nextMonth = useCallback(() => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const prevMonth = useCallback(() => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const goToMonth = useCallback((year: number, monthIndex: number) => {
    setCurrentDate(new Date(year, monthIndex, 1));
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(getLocalTodayIso(now));
  }, []);

  // Eventos filtrados
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((evt) => {
      if (!showAcademic && evt.type === 'academic') return false;
      if (!showManual && evt.type === 'manual') return false;
      if (!showFeedTasks && evt.type === 'feed_task') return false;

      // Filtro por matéria selecionada
      if (selectedCourse && selectedCourse !== 'all') {
        const scUpper = selectedCourse.trim().toUpperCase();
        const targets = new Set<string>([scUpper]);
        courses.forEach((c) => {
          const cCode = c.code?.trim().toUpperCase();
          const cName = c.name?.trim().toUpperCase();
          if (cCode === scUpper || cName === scUpper || c.id === selectedCourse) {
            if (cCode) targets.add(cCode);
            if (cName) targets.add(cName);
          }
        });
        disciplines.forEach((d) => {
          const dCode = d.code?.trim().toUpperCase();
          const dName = d.name?.trim().toUpperCase();
          if (dCode === scUpper || dName === scUpper || d.id === selectedCourse) {
            if (dCode) targets.add(dCode);
            if (dName) targets.add(dName);
            d.aprenderCourses.forEach((ac) => {
              if (ac.code) targets.add(ac.code.trim().toUpperCase());
              if (ac.name) targets.add(ac.name.trim().toUpperCase());
            });
            (d.teamsCourses ?? []).forEach((tc) => {
              if (tc.code) targets.add(tc.code.trim().toUpperCase());
              if (tc.name) targets.add(tc.name.trim().toUpperCase());
            });
          }
        });

        const eventCode = evt.courseCode?.trim().toUpperCase();
        const eventName = evt.courseName?.trim().toUpperCase();

        const matches =
          (eventCode && (targets.has(eventCode) || Array.from(targets).some((t) => eventCode.includes(t) || t.includes(eventCode)))) ||
          (eventName && (targets.has(eventName) || Array.from(targets).some((t) => eventName.includes(t) || t.includes(eventName))));

        if (!matches) {
          return false;
        }
      }

      if (q) {
        const titleMatch = evt.title.toLowerCase().includes(q);
        const descMatch = evt.description?.toLowerCase().includes(q);
        const courseMatch = evt.courseName?.toLowerCase().includes(q) || evt.courseCode?.toLowerCase().includes(q);
        const catMatch = evt.categoryLabel.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !courseMatch && !catMatch) {
          return false;
        }
      }

      return true;
    });
  }, [events, showAcademic, showManual, showFeedTasks, selectedCourse, searchQuery, courses, disciplines]);

  // Eventos para o dia selecionado (para o painel lateral)
  const eventsForSelectedDate = useMemo(() => {
    return filteredEvents.filter((evt) => {
      if (evt.date === selectedDate) return true;
      if (evt.endDate && evt.date <= selectedDate && evt.endDate >= selectedDate) {
        return true;
      }
      return false;
    });
  }, [filteredEvents, selectedDate]);

  // Constrói as 42 células do mês para a grade de visualização
  const monthGridDays = useMemo<CalendarDayCell[]>(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-11

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const firstDayWeekday = firstDayOfMonth.getDay(); // 0 = Domingo
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const todayStr = getLocalTodayIso();

    const cells: CalendarDayCell[] = [];

    // Dias do mês anterior para completar o início da semana
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const cellEvents = filteredEvents.filter((evt) => {
        if (evt.date === dateStr) return true;
        if (evt.endDate && evt.date <= dateStr && evt.endDate >= dateStr) return true;
        return false;
      });

      cells.push({
        date: dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        events: cellEvents,
        hasAcademic: cellEvents.some((e) => e.type === 'academic'),
        hasDeadline: cellEvents.some((e) => e.isDeadline),
        hasManual: cellEvents.some((e) => e.type === 'manual'),
        hasFeedTask: cellEvents.some((e) => e.type === 'feed_task'),
      });
    }

    // Dias do mês corrente
    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const m = String(month + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      const dateStr = `${year}-${m}-${d}`;

      const cellEvents = filteredEvents.filter((evt) => {
        if (evt.date === dateStr) return true;
        if (evt.endDate && evt.date <= dateStr && evt.endDate >= dateStr) return true;
        return false;
      });

      cells.push({
        date: dateStr,
        dayNumber: dayNum,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        events: cellEvents,
        hasAcademic: cellEvents.some((e) => e.type === 'academic'),
        hasDeadline: cellEvents.some((e) => e.isDeadline),
        hasManual: cellEvents.some((e) => e.type === 'manual'),
        hasFeedTask: cellEvents.some((e) => e.type === 'feed_task'),
      });
    }

    // Dias do próximo mês para completar 42 células (6 linhas de 7) ou múltiplo de 7
    const remainingDays = 42 - cells.length;
    for (let dayNum = 1; dayNum <= remainingDays; dayNum++) {
      const nextDate = new Date(year, month + 1, dayNum);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const cellEvents = filteredEvents.filter((evt) => {
        if (evt.date === dateStr) return true;
        if (evt.endDate && evt.date <= dateStr && evt.endDate >= dateStr) return true;
        return false;
      });

      cells.push({
        date: dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        events: cellEvents,
        hasAcademic: cellEvents.some((e) => e.type === 'academic'),
        hasDeadline: cellEvents.some((e) => e.isDeadline),
        hasManual: cellEvents.some((e) => e.type === 'manual'),
        hasFeedTask: cellEvents.some((e) => e.type === 'feed_task'),
      });
    }

    return cells;
  }, [currentDate, filteredEvents, selectedDate]);

  // Ações de criação, edição e exclusão de eventos manuais
  const openCreateDialog = useCallback(
    (dateToPrefill?: string, endDateToPrefill?: string) => {
      setEditingEvent(null);
      const start = dateToPrefill || selectedDate;
      const end = endDateToPrefill || start;
      setPrefilledDate(start);
      setPrefilledEndDate(end);
      setIsEventDialogOpen(true);
    },
    [selectedDate]
  );

  const openEditDialog = useCallback((event: UserCalendarEvent | UnifiedCalendarEvent) => {
    if ('type' in event && event.type === 'manual' && event.rawPayload) {
      setEditingEvent(event.rawPayload as UserCalendarEvent);
    } else if ('type' in event && event.type !== 'manual') {
      setEditingEvent({
        id: event.id,
        title: event.title,
        date: event.date,
        endDate: event.endDate || event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        allDay: event.allDay,
        category: (event.type === 'academic' ? 'academic' : 'personal') as CalendarEventCategory,
        courseName: event.courseName,
        courseCode: event.courseCode,
        description: event.description,
        createdAt: '',
        updatedAt: '',
        isReadOnly: true,
      } as UserCalendarEvent & { isReadOnly?: boolean });
    } else {
      setEditingEvent(event as UserCalendarEvent);
    }
    setPrefilledDate(undefined);
    setPrefilledEndDate(undefined);
    setIsEventDialogOpen(true);
  }, []);

  const closeEventDialog = useCallback(() => {
    setIsEventDialogOpen(false);
    setEditingEvent(null);
    setPrefilledDate(undefined);
    setPrefilledEndDate(undefined);
  }, []);

  const saveManualEvent = useCallback(
    async (dto: CreateUserEventDTO | UpdateUserEventDTO) => {
      setIsSaving(true);
      try {
        if ('id' in dto && dto.id) {
          await useCases.manageUserEvents.updateEvent(dto as UpdateUserEventDTO);
          toast.add({
            title: 'Evento atualizado',
            description: `"${dto.title}" foi salvo com sucesso.`,
            type: 'success',
          });
        } else {
          await useCases.manageUserEvents.createEvent(dto as CreateUserEventDTO);
          toast.add({
            title: 'Evento criado',
            description: `"${dto.title}" foi adicionado ao calendário.`,
            type: 'success',
          });
        }
        closeEventDialog();
        await loadData();
      } catch (err: unknown) {
        console.error('Falha ao salvar evento manual:', err);
        const message = err instanceof Error ? err.message : 'Verifique as informações e tente novamente.';
        toast.add({
          title: 'Erro ao salvar',
          description: message,
          type: 'error',
        });
      } finally {
        setIsSaving(false);
      }
    },
    [useCases.manageUserEvents, closeEventDialog, loadData]
  );

  const deleteManualEvent = useCallback(
    async (id: string) => {
      setIsSaving(true);
      try {
        await useCases.manageUserEvents.deleteEvent(id);
        toast.add({
          title: 'Evento removido',
          description: 'O evento foi excluído do seu calendário.',
          type: 'success',
        });
        setEventToDelete(null);
        await loadData();
      } catch (err: unknown) {
        console.error('Falha ao excluir evento:', err);
        const message = err instanceof Error ? err.message : 'Não foi possível excluir o evento.';
        toast.add({
          title: 'Erro ao excluir',
          description: message,
          type: 'error',
        });
      } finally {
        setIsSaving(false);
      }
    },
    [useCases.manageUserEvents, loadData]
  );

  const toggleEventCompleted = useCallback(
    async (id: string) => {
      try {
        await useCases.manageUserEvents.toggleCompleted(id);
        await loadData();
      } catch (err) {
        console.error('Falha ao alternar conclusão do evento:', err);
      }
    },
    [useCases.manageUserEvents, loadData]
  );

  return {
    currentDate,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    events,
    filteredEvents,
    eventsForSelectedDate,
    academicCalendar,
    courses,
    monthGridDays,
    isLoading,
    isSaving,
    // Filtros
    showAcademic,
    setShowAcademic,
    showManual,
    setShowManual,
    showFeedTasks,
    setShowFeedTasks,
    selectedCourse,
    setSelectedCourse,
    searchQuery,
    setSearchQuery,
    // Navegação
    nextMonth,
    prevMonth,
    goToMonth,
    goToToday,
    // Diálogos e ações
    isEventDialogOpen,
    editingEvent,
    prefilledDate,
    prefilledEndDate,
    openCreateDialog,
    openEditDialog,
    closeEventDialog,
    saveManualEvent,
    eventToDelete,
    setEventToDelete,
    deleteManualEvent,
    toggleEventCompleted,
  };
}
