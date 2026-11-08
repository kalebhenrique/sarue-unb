import type { UserCalendarEvent } from '../domain/entities/user-calendar-event';
import type { IUserEventsRepository } from '../domain/interfaces/user-events-repo.interface';
import { InMemoryUserEventsRepository } from './in-memory-user-events.repo';
import { getDatabase } from './sqlite-feed.repo';

const LOCAL_STORAGE_KEY = 'sarue_user_calendar_events';

interface SqliteUserEventRow {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: number;
  category: string;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  location: string | null;
  notify?: number | null;
  is_completed: number;
  created_at: string;
  updated_at: string;
}

export class SqliteUserEventsRepository implements IUserEventsRepository {
  private fallbackRepo: InMemoryUserEventsRepository;
  private tableInitialized = false;

  constructor() {
    this.fallbackRepo = new InMemoryUserEventsRepository(this.loadFromLocalStorage());
  }

  private loadFromLocalStorage(): UserCalendarEvent[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // LocalStorage corrompido ou indisponível
    }
    return [];
  }

  private saveToLocalStorage(events: UserCalendarEvent[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(events));
    } catch {
      // Falha ao gravar no localStorage
    }
  }

  private async ensureTable(): Promise<void> {
    if (this.tableInitialized) return;
    const db = await getDatabase();
    if (!db) return;

    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS user_calendar_events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          date TEXT NOT NULL,
          end_date TEXT,
          start_time TEXT,
          end_time TEXT,
          all_day INTEGER NOT NULL DEFAULT 1,
          category TEXT NOT NULL,
          course_id TEXT,
          course_code TEXT,
          course_name TEXT,
          location TEXT,
          notify INTEGER NOT NULL DEFAULT 1,
          is_completed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      try {
        await db.execute('ALTER TABLE user_calendar_events ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;');
      } catch {
        // Coluna notify já existe no schema
      }
      this.tableInitialized = true;
    } catch (e) {
      console.warn('[SqliteUserEventsRepository] Falha ao verificar tabela user_calendar_events:', e);
    }
  }

  async getEvents(): Promise<UserCalendarEvent[]> {
    const db = await getDatabase();
    if (!db) return this.fallbackRepo.getEvents();

    try {
      await this.ensureTable();
      const rows = await db.select<SqliteUserEventRow[]>(
        'SELECT * FROM user_calendar_events ORDER BY date ASC, start_time ASC;'
      );

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description ?? undefined,
        date: r.date,
        endDate: r.end_date ?? undefined,
        startTime: r.start_time ?? undefined,
        endTime: r.end_time ?? undefined,
        allDay: Boolean(r.all_day),
        category: r.category as UserCalendarEvent['category'],
        courseId: r.course_id ?? undefined,
        courseCode: r.course_code ?? undefined,
        courseName: r.course_name ?? undefined,
        location: r.location ?? undefined,
        notify: r.notify !== undefined && r.notify !== null ? Boolean(r.notify) : true,
        isCompleted: Boolean(r.is_completed),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (e) {
      console.warn('[SqliteUserEventsRepository] Falha ao ler eventos do SQLite:', e);
      return this.fallbackRepo.getEvents();
    }
  }

  async getEventById(id: string): Promise<UserCalendarEvent | null> {
    const db = await getDatabase();
    if (!db) return this.fallbackRepo.getEventById(id);

    try {
      await this.ensureTable();
      const rows = await db.select<SqliteUserEventRow[]>(
        'SELECT * FROM user_calendar_events WHERE id = $1 LIMIT 1;',
        [id]
      );
      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          title: r.title,
          description: r.description ?? undefined,
          date: r.date,
          endDate: r.end_date ?? undefined,
          startTime: r.start_time ?? undefined,
          endTime: r.end_time ?? undefined,
          allDay: Boolean(r.all_day),
          category: r.category as UserCalendarEvent['category'],
          courseId: r.course_id ?? undefined,
          courseCode: r.course_code ?? undefined,
          courseName: r.course_name ?? undefined,
          location: r.location ?? undefined,
          notify: r.notify !== undefined && r.notify !== null ? Boolean(r.notify) : true,
          isCompleted: Boolean(r.is_completed),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      }
      return null;
    } catch {
      return this.fallbackRepo.getEventById(id);
    }
  }

  async saveEvent(event: UserCalendarEvent): Promise<void> {
    // Atualiza fallback em memória e localStorage imediatamente
    await this.fallbackRepo.saveEvent(event);
    this.saveToLocalStorage(await this.fallbackRepo.getEvents());

    const db = await getDatabase();
    if (!db) return;

    try {
      await this.ensureTable();
      await db.execute(
        `INSERT INTO user_calendar_events (
          id, title, description, date, end_date, start_time, end_time,
          all_day, category, course_id, course_code, course_name, location,
          notify, is_completed, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT(id) DO UPDATE SET
          title = $2, description = $3, date = $4, end_date = $5,
          start_time = $6, end_time = $7, all_day = $8, category = $9,
          course_id = $10, course_code = $11, course_name = $12, location = $13,
          notify = $14, is_completed = $15, updated_at = $17;`,
        [
          event.id,
          event.title,
          event.description ?? null,
          event.date,
          event.endDate ?? null,
          event.startTime ?? null,
          event.endTime ?? null,
          event.allDay ? 1 : 0,
          event.category,
          event.courseId ?? null,
          event.courseCode ?? null,
          event.courseName ?? null,
          event.location ?? null,
          event.notify !== false ? 1 : 0,
          event.isCompleted ? 1 : 0,
          event.createdAt,
          event.updatedAt,
        ]
      );
    } catch (e) {
      console.warn('[SqliteUserEventsRepository] Falha ao persistir evento no SQLite:', e);
    }
  }

  async updateEvent(event: UserCalendarEvent): Promise<void> {
    return this.saveEvent(event);
  }

  async deleteEvent(id: string): Promise<void> {
    await this.fallbackRepo.deleteEvent(id);
    this.saveToLocalStorage(await this.fallbackRepo.getEvents());

    const db = await getDatabase();
    if (!db) return;

    try {
      await this.ensureTable();
      await db.execute('DELETE FROM user_calendar_events WHERE id = $1;', [id]);
    } catch (e) {
      console.warn('[SqliteUserEventsRepository] Falha ao deletar evento no SQLite:', e);
    }
  }

  async toggleCompleted(id: string): Promise<void> {
    await this.fallbackRepo.toggleCompleted(id);
    this.saveToLocalStorage(await this.fallbackRepo.getEvents());

    const db = await getDatabase();
    if (!db) return;

    try {
      await this.ensureTable();
      await db.execute(
        'UPDATE user_calendar_events SET is_completed = CASE WHEN is_completed = 1 THEN 0 ELSE 1 END, updated_at = $1 WHERE id = $2;',
        [new Date().toISOString(), id]
      );
    } catch (e) {
      console.warn('[SqliteUserEventsRepository] Falha ao alternar conclusão no SQLite:', e);
    }
  }
}
