import type { UserCalendarEvent } from '../entities/user-calendar-event';

export interface IUserEventsRepository {
  getEvents(): Promise<UserCalendarEvent[]>;
  getEventById(id: string): Promise<UserCalendarEvent | null>;
  saveEvent(event: UserCalendarEvent): Promise<void>;
  updateEvent(event: UserCalendarEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  toggleCompleted(id: string): Promise<void>;
}
