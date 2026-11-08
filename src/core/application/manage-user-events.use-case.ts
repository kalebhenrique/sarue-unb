import type { UserCalendarEvent } from '../domain/entities/user-calendar-event';
import type { IUserEventsRepository } from '../domain/interfaces/user-events-repo.interface';

export interface CreateUserEventDTO {
  title: string;
  description?: string;
  date: string;          // ISO "YYYY-MM-DD"
  endDate?: string;      // ISO "YYYY-MM-DD"
  startTime?: string;    // "HH:MM"
  endTime?: string;      // "HH:MM"
  allDay?: boolean;
  category: UserCalendarEvent['category'];
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  location?: string;
  notify?: boolean;
}

export interface UpdateUserEventDTO {
  id: string;
  title: string;
  description?: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  category: UserCalendarEvent['category'];
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  location?: string;
  notify?: boolean;
  isCompleted?: boolean;
}

export class ManageUserEventsUseCase {
  constructor(private readonly userEventsRepo: IUserEventsRepository) {}

  async getEvents(): Promise<UserCalendarEvent[]> {
    return this.userEventsRepo.getEvents();
  }

  async getEventById(id: string): Promise<UserCalendarEvent | null> {
    return this.userEventsRepo.getEventById(id);
  }

  async createEvent(dto: CreateUserEventDTO): Promise<UserCalendarEvent> {
    const trimmedTitle = dto.title.trim();
    if (!trimmedTitle) {
      throw new Error('O título do evento não pode ser vazio.');
    }
    if (!dto.date) {
      throw new Error('A data do evento é obrigatória.');
    }

    const now = new Date().toISOString();
    const event: UserCalendarEvent = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: trimmedTitle,
      description: dto.description?.trim(),
      date: dto.date,
      endDate: dto.endDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      allDay: dto.allDay ?? (!dto.startTime && !dto.endTime),
      category: dto.category,
      courseId: dto.courseId,
      courseCode: dto.courseCode,
      courseName: dto.courseName,
      location: dto.location?.trim(),
      notify: dto.notify ?? true,
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.userEventsRepo.saveEvent(event);
    return event;
  }

  async updateEvent(dto: UpdateUserEventDTO): Promise<UserCalendarEvent> {
    const existing = await this.userEventsRepo.getEventById(dto.id);
    if (!existing) {
      throw new Error(`Evento com ID ${dto.id} não encontrado.`);
    }

    const trimmedTitle = dto.title.trim();
    if (!trimmedTitle) {
      throw new Error('O título do evento não pode ser vazio.');
    }

    const now = new Date().toISOString();
    const updated: UserCalendarEvent = {
      ...existing,
      title: trimmedTitle,
      description: dto.description?.trim(),
      date: dto.date,
      endDate: dto.endDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      allDay: dto.allDay ?? (!dto.startTime && !dto.endTime),
      category: dto.category,
      courseId: dto.courseId,
      courseCode: dto.courseCode,
      courseName: dto.courseName,
      location: dto.location?.trim(),
      notify: dto.notify ?? existing.notify ?? true,
      isCompleted: dto.isCompleted ?? existing.isCompleted,
      updatedAt: now,
    };

    await this.userEventsRepo.updateEvent(updated);
    return updated;
  }

  async deleteEvent(id: string): Promise<void> {
    await this.userEventsRepo.deleteEvent(id);
  }

  async toggleCompleted(id: string): Promise<void> {
    await this.userEventsRepo.toggleCompleted(id);
  }
}
