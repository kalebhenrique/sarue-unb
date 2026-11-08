import type { FeedItem, PlatformType, FeedItemType } from '../domain/entities/feed-item';
import type { Course, CourseAssociation } from '../domain/entities/course';
import type { IFeedRepository, FeedFilterOptions } from '../domain/interfaces/feed-repo.interface';

import type Database from '@tauri-apps/plugin-sql';

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface SqliteFeedItemRow {
  id: string;
  platform: string;
  title: string;
  content: string;
  course_name: string;
  course_code: string;
  author: string | null;
  item_type: string;
  created_at: string;
  due_date: string | null;
  is_completed: number;
  is_hidden: number; // coluna legada: representa "arquivado"
  external_url: string | null;
}

interface SqliteCourseRow {
  id: string;
  code: string;
  name: string;
  semester: string;
  platform: string;
  professor: string | null;
  classroom: string | null;
  schedule: string | null;
  turma: string | null;
  unread_count: number;
  pending_assignments_count: number;
  url: string | null;
  absences: number | null;
  max_absences: number | null;
}

interface SqliteCourseAssociationRow {
  aprender_course_id: string;
  sigaa_course_id: string | null;
  is_ignored: number;
  updated_at: string;
}

// Cache global de conexão com o banco SQLite
let cachedDbPromise: Promise<Database | null> | null = null;

// Espelho em memória para ambientes sem Tauri (testes unitários e prévia web)
const inMemoryItems = new Map<string, FeedItem>();
const inMemoryCourses = new Map<string, Course>();
const inMemoryAssociations = new Map<string, CourseAssociation>();


export async function getDatabase(): Promise<Database | null> {
  if (!isTauriEnvironment()) return null;

  if (!cachedDbPromise) {
    cachedDbPromise = (async () => {
      try {
        const { default: Database } = await import('@tauri-apps/plugin-sql');
        const { SQLITE_DB_NAME } = await import('./db-config');
        const db = await Database.load(SQLITE_DB_NAME);

        // Garante compatibilidade transparente com bases locais legadas pré-migrações
        try { await db.execute('ALTER TABLE courses ADD COLUMN url TEXT;'); } catch {}
        try { await db.execute('ALTER TABLE courses ADD COLUMN turma TEXT;'); } catch {}
        try { await db.execute('ALTER TABLE courses ADD COLUMN absences INTEGER;'); } catch {}
        try { await db.execute('ALTER TABLE courses ADD COLUMN max_absences INTEGER;'); } catch {}
        try { await db.execute('ALTER TABLE feed_items ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;'); } catch {}
        try { await db.execute('ALTER TABLE feed_items ADD COLUMN external_url TEXT;'); } catch {}

        // Remove dados legados do MoodleMat (plataforma descontinuada)
        try {
          await db.execute("DELETE FROM courses WHERE platform = 'moodlemat';");
          await db.execute("DELETE FROM feed_items WHERE platform = 'moodlemat';");
        } catch (e) {
          console.warn('Erro ao limpar dados legados do MoodleMat no SQLite:', e);
        }

        // Remove banners de notificação, botões de sistema ou idioma do Teams salvos por versões anteriores
        try {
          await db.execute("DELETE FROM courses WHERE platform = 'teams' AND (name LIKE '%language%' OR name LIKE '%restart%' OR name LIKE '%notifica%' OR name LIKE '%announcement%' OR name LIKE '%join or create%' OR name LIKE '%classes%' OR name LIKE '%equipes%' OR name = 'TEAMS');");
          await db.execute("DELETE FROM feed_items WHERE platform = 'teams' AND (title LIKE '%desktop notifications%' OR title LIKE '%Apply and restart%' OR title LIKE '%Stay in the know%' OR title LIKE '%restart for change language%' OR content LIKE '%Stay in the know%' OR title LIKE '%Aviso: OAC Prof Ricardo Jacobi%');");
        } catch {}

        return db;
      } catch (err) {
        console.warn('SQLite nativo não inicializado, operando com espelho em memória:', err);
        return null;
      }
    })();
  }

  return cachedDbPromise;
}

export class SqliteFeedRepository implements IFeedRepository {
  async getItems(filters?: FeedFilterOptions): Promise<FeedItem[]> {
    const db = await getDatabase();

    if (db) {
      try {
        let query = 'SELECT * FROM feed_items WHERE 1=1';
        const params: (string | number)[] = [];

        if (filters?.onlyArchived) {
          query += ' AND is_hidden = 1';
        } else if (!filters?.includeArchived) {
          query += ' AND (is_hidden = 0 OR is_hidden IS NULL)';
        }

        if (filters) {
          if (filters.platform && filters.platform !== 'all') {
            params.push(filters.platform);
            query += ` AND platform = $${params.length}`;
          }

          if (filters.itemType && filters.itemType !== 'all') {
            params.push(filters.itemType);
            query += ` AND item_type = $${params.length}`;
          }

          if (filters.courseCode) {
            params.push(filters.courseCode);
            query += ` AND course_code = $${params.length}`;
          }

          if (filters.courseCodes && filters.courseCodes.length > 0) {
            const placeholders = filters.courseCodes
              .map((c) => {
                params.push(c);
                return `$${params.length}`;
              })
              .join(', ');
            query += ` AND course_code IN (${placeholders})`;
          }

          if (filters.courseNames && filters.courseNames.length > 0) {
            const placeholders = filters.courseNames
              .map((n) => {
                params.push(n);
                return `$${params.length}`;
              })
              .join(', ');
            query += ` AND course_name IN (${placeholders})`;
          }

          if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
            params.push(`%${filters.searchQuery.trim().toLowerCase()}%`);
            query += ` AND (LOWER(title) LIKE $${params.length} OR LOWER(content) LIKE $${params.length} OR LOWER(course_name) LIKE $${params.length})`;
          }
        }

        query += ' ORDER BY created_at DESC';

        const rows: SqliteFeedItemRow[] = await db.select(query, params);

        const items: FeedItem[] = rows.map((row) => ({
          id: row.id,
          platform: row.platform as PlatformType,
          title: row.title,
          content: row.content,
          courseName: row.course_name,
          courseCode: row.course_code,
          author: row.author ?? undefined,
          itemType: row.item_type as FeedItemType,
          createdAt: row.created_at,
          dueDate: row.due_date ?? undefined,
          isCompleted: Boolean(row.is_completed),
          isArchived: Boolean(row.is_hidden),
          externalUrl: row.external_url ?? undefined,
        }));

        // Atualiza espelho
        for (const item of items) {
          inMemoryItems.set(item.id, item);
        }

        return items;
      } catch (e) {
        console.warn('Erro ao consultar feed no SQLite, utilizando espelho:', e);
      }
    }

    // Fallback para espelho em memória
    let result = Array.from(inMemoryItems.values());

    if (filters?.onlyArchived) {
      result = result.filter((item) => Boolean(item.isArchived));
    } else if (!filters?.includeArchived) {
      result = result.filter((item) => !item.isArchived);
    }

    if (filters) {
      if (filters.platform && filters.platform !== 'all') {
        result = result.filter((item) => item.platform === filters.platform);
      }
      if (filters.itemType && filters.itemType !== 'all') {
        result = result.filter((item) => item.itemType === filters.itemType);
      }
      if (filters.courseCode) {
        result = result.filter((item) => item.courseCode === filters.courseCode);
      }
      if (filters.courseCodes && filters.courseCodes.length > 0) {
        result = result.filter((item) => item.courseCode && filters.courseCodes!.includes(item.courseCode));
      }
      if (filters.courseNames && filters.courseNames.length > 0) {
        result = result.filter((item) => filters.courseNames!.includes(item.courseName));
      }
      if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
        const q = filters.searchQuery.toLowerCase();
        result = result.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.content.toLowerCase().includes(q) ||
            item.courseName.toLowerCase().includes(q)
        );
      }
    }

    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async saveItems(newItems: FeedItem[]): Promise<void> {
    for (const item of newItems) {
      const existing = inMemoryItems.get(item.id);
      inMemoryItems.set(item.id, {
        ...item,
        isCompleted: existing?.isCompleted ?? item.isCompleted ?? false,
        isArchived: existing?.isArchived ?? item.isArchived ?? false,
      });
    }

    const db = await getDatabase();
    if (db) {
      try {
        for (const item of newItems) {
          await db.execute(
            `INSERT INTO feed_items (
              id, platform, title, content, course_name, course_code, author, item_type, created_at, due_date, is_completed, is_hidden, external_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              content = excluded.content,
              course_name = excluded.course_name,
              course_code = excluded.course_code,
              author = excluded.author,
              item_type = excluded.item_type,
              created_at = excluded.created_at,
              due_date = excluded.due_date,
              external_url = excluded.external_url;`,
            [
              item.id,
              item.platform,
              item.title,
              item.content,
              item.courseName,
              item.courseCode || item.courseName || '',
              item.author ?? null,
              item.itemType,
              item.createdAt,
              item.dueDate ?? null,
              item.isCompleted ? 1 : 0,
              item.isArchived ? 1 : 0,
              item.externalUrl ?? null,
            ]
          );
        }
      } catch (e) {
        console.warn('Erro ao persistir items no SQLite:', e);
      }
    }
  }

  async markItemAsCompleted(id: string, isCompleted: boolean): Promise<void> {
    const existing = inMemoryItems.get(id);
    if (existing) {
      inMemoryItems.set(id, { ...existing, isCompleted });
    }

    const db = await getDatabase();
    if (db) {
      try {
        await db.execute('UPDATE feed_items SET is_completed = $1 WHERE id = $2', [
          isCompleted ? 1 : 0,
          id,
        ]);
      } catch (e) {
        console.warn('Erro ao atualizar status de conclusão no SQLite:', e);
      }
    }
  }

  async archiveItem(id: string, isArchived: boolean): Promise<void> {
    const existing = inMemoryItems.get(id);
    if (existing) {
      inMemoryItems.set(id, { ...existing, isArchived });
    }

    const db = await getDatabase();
    if (db) {
      try {
        await db.execute('UPDATE feed_items SET is_hidden = $1 WHERE id = $2', [
          isArchived ? 1 : 0,
          id,
        ]);
      } catch (e) {
        console.warn('Erro ao atualizar status de arquivamento no SQLite:', e);
      }
    }
  }

  async getCourses(): Promise<Course[]> {
    const db = await getDatabase();

    if (db) {
      try {
        const rows: SqliteCourseRow[] = await db.select(
          'SELECT * FROM courses ORDER BY name ASC'
        );

        const courses: Course[] = rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          semester: row.semester,
          platform: row.platform as PlatformType,
          professor: row.professor ?? undefined,
          classroom: row.classroom ?? undefined,
          schedule: row.schedule ?? undefined,
          turma: row.turma ?? undefined,
          unreadCount: Number(row.unread_count || 0),
          pendingAssignmentsCount: Number(row.pending_assignments_count || 0),
          url: row.url ?? undefined,
          absences: row.absences !== null && row.absences !== undefined ? Number(row.absences) : undefined,
          maxAbsences: row.max_absences !== null && row.max_absences !== undefined ? Number(row.max_absences) : undefined,
        }));

        for (const c of courses) {
          inMemoryCourses.set(c.id, c);
        }

        return courses;
      } catch (e) {
        console.warn('Erro ao carregar turmas no SQLite, utilizando espelho:', e);
      }
    }

    return Array.from(inMemoryCourses.values());
  }

  async saveCourses(newCourses: Course[]): Promise<void> {
    for (const course of newCourses) {
      inMemoryCourses.set(course.id, { ...course });
    }

    const db = await getDatabase();
    if (db) {
      try {
        for (const course of newCourses) {
          await db.execute(
            `INSERT OR REPLACE INTO courses (
              id, code, name, semester, platform, professor, classroom, schedule, turma, unread_count, pending_assignments_count, url, absences, max_absences
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              course.id,
              course.code,
              course.name,
              course.semester,
              course.platform,
              course.professor ?? null,
              course.classroom ?? null,
              course.schedule ?? null,
              course.turma ?? null,
              course.unreadCount ?? 0,
              course.pendingAssignmentsCount ?? 0,
              course.url ?? null,
              course.absences ?? null,
              course.maxAbsences ?? null,
            ]
          );
        }
      } catch (e) {
        console.warn('Erro ao salvar turmas no SQLite:', e);
      }
    }
  }

  async getAssociations(): Promise<CourseAssociation[]> {
    const db = await getDatabase();
    if (db) {
      try {
        const rows: SqliteCourseAssociationRow[] = await db.select(
          'SELECT * FROM course_associations'
        );
        const list: CourseAssociation[] = rows.map((r) => ({
          aprenderCourseId: r.aprender_course_id,
          sigaaCourseId: r.sigaa_course_id,
          isIgnored: Boolean(r.is_ignored),
          updatedAt: r.updated_at,
        }));
        for (const a of list) {
          inMemoryAssociations.set(a.aprenderCourseId, a);
        }
        return list;
      } catch (e) {
        console.warn('Erro ao carregar associações de turmas no SQLite:', e);
      }
    }
    return Array.from(inMemoryAssociations.values());
  }

  async saveAssociation(association: CourseAssociation): Promise<void> {
    inMemoryAssociations.set(association.aprenderCourseId, { ...association });
    const db = await getDatabase();
    if (db) {
      try {
        await db.execute(
          `INSERT OR REPLACE INTO course_associations (
            aprender_course_id, sigaa_course_id, is_ignored, updated_at
          ) VALUES ($1, $2, $3, $4)`,
          [
            association.aprenderCourseId,
            association.sigaaCourseId ?? null,
            association.isIgnored ? 1 : 0,
            association.updatedAt || new Date().toISOString(),
          ]
        );
      } catch (e) {
        console.warn('Erro ao salvar associação no SQLite:', e);
      }
    }
  }

  async clear(): Promise<void> {
    inMemoryItems.clear();
    inMemoryCourses.clear();
    inMemoryAssociations.clear();

    const db = await getDatabase();
    if (db) {
      try {
        await db.execute('DELETE FROM feed_items');
        await db.execute('DELETE FROM courses');
        await db.execute('DELETE FROM course_associations');
      } catch (e) {
        console.warn('Erro ao limpar banco SQLite:', e);
      }
    }
  }
}

