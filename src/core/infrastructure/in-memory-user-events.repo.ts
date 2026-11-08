import type { UserCalendarEvent } from '../domain/entities/user-calendar-event';
import type { IUserEventsRepository } from '../domain/interfaces/user-events-repo.interface';

export class InMemoryUserEventsRepository implements IUserEventsRepository {
  private events: Map<string, UserCalendarEvent> = new Map();

  constructor(initialEvents: UserCalendarEvent[] = []) {
    for (const evt of initialEvents) {
      this.events.set(evt.id, { ...evt });
    }
  }

  async getEvents(): Promise<UserCalendarEvent[]> {
    return Array.from(this.events.values()).map((evt) => ({ ...evt }));
  }

  async getEventById(id: string): Promise<UserCalendarEvent | null> {
    const evt = this.events.get(id);
    return evt ? { ...evt } : null;
  }

  async saveEvent(event: UserCalendarEvent): Promise<void> {
    this.events.set(event.id, { ...event });
  }

  async updateEvent(event: UserCalendarEvent): Promise<void> {
    this.events.set(event.id, { ...event });
  }

  async deleteEvent(id: string): Promise<void> {
    this.events.delete(id);
  }

  async toggleCompleted(id: string): Promise<void> {
    const evt = this.events.get(id);
    if (evt) {
      evt.isCompleted = !evt.isCompleted;
      evt.updatedAt = new Date().toISOString();
    }
  }
}
