import type { StudentAcademicProfile } from '../domain/entities/academic-profile';
import type { CurriculumStructure } from '../domain/entities/course';
import type { SigaaCredentials } from '../domain/entities/credential';
import type {
  IAcademicProfileRepository,
  SigaaHistoryRawResponse,
} from '../domain/interfaces/academic-profile-repo.interface';
import { InMemoryAcademicProfileRepository } from './in-memory-academic-profile.repo';
import { getDatabase } from './sqlite-feed.repo';
import { mapCurriculaDtos } from './mappers/curriculum.mapper';
import { parseAcademicProfileJson, parseCurriculumListJson } from './persistence-codec';

const PROFILE_ROW_ID = 'current';

async function saveCurriculaToDb(
  db: NonNullable<Awaited<ReturnType<typeof getDatabase>>>,
  courseId: string,
  curricula: CurriculumStructure[]
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO curricula_cache (course_id, payload, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT(course_id) DO UPDATE SET payload = $2, updated_at = $3;`,
      [courseId, JSON.stringify(curricula), new Date().toISOString()]
    );
  } catch (e) {
    console.warn('[TauriAcademicProfileRepository] Falha ao salvar matrizes no SQLite:', e);
  }
}

export class TauriAcademicProfileRepository implements IAcademicProfileRepository {
  private fallbackRepo = new InMemoryAcademicProfileRepository();

  async getProfile(): Promise<StudentAcademicProfile | null> {
    const db = await getDatabase();
    if (db) {
      try {
        const rows = await db.select<{ payload: string }[]>(
          'SELECT payload FROM academic_profile WHERE id = $1 LIMIT 1;',
          [PROFILE_ROW_ID]
        );
        if (rows && rows.length > 0) {
          const parsed = parseAcademicProfileJson(rows[0].payload);
          if (parsed) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('[TauriAcademicProfileRepository] Falha ao ler perfil do SQLite, usando fallback:', e);
      }
    }
    return this.fallbackRepo.getProfile();
  }

  async saveProfile(profile: StudentAcademicProfile): Promise<void> {
    await this.fallbackRepo.saveProfile(profile);
    const db = await getDatabase();
    if (db) {
      try {
        await db.execute(
          `INSERT INTO academic_profile (id, payload, updated_at) VALUES ($1, $2, $3)
           ON CONFLICT(id) DO UPDATE SET payload = $2, updated_at = $3;`,
          [PROFILE_ROW_ID, JSON.stringify(profile), profile.updatedAt || new Date().toISOString()]
        );
      } catch (e) {
        console.warn('[TauriAcademicProfileRepository] Falha ao salvar perfil no SQLite:', e);
      }
    }
  }

  async clearProfile(): Promise<void> {
    await this.fallbackRepo.clearProfile();
    const db = await getDatabase();
    if (db) {
      try {
        await db.execute('DELETE FROM academic_profile WHERE id = $1;', [PROFILE_ROW_ID]);
        await db.execute('DELETE FROM curricula_cache;');
      } catch (e) {
        console.warn('[TauriAcademicProfileRepository] Falha ao limpar perfil no SQLite:', e);
      }
    }
  }

  async getAllCurricula(): Promise<CurriculumStructure[]> {
    try {
      const { commands } = await import('@/core/infrastructure/bindings');
      const response = await commands.getAllCurricula();
      if (response.status === 'ok' && response.data && response.data.length > 0) {
        return mapCurriculaDtos(response.data);
      }
    } catch (e) {
      console.warn('[TauriAcademicProfileRepository] Erro ao buscar via bindings Tauri:', e);
    }

    return this.fallbackRepo.getAllCurricula();
  }

  async getCurriculaForCourse(courseId: string): Promise<CurriculumStructure[]> {
    if (!courseId) return [];
    const db = await getDatabase();

    try {
      const { commands } = await import('@/core/infrastructure/bindings');
      const response = await commands.getCourseCurriculum(courseId);
      if (response.status === 'ok' && response.data && response.data.length > 0) {
        const mapped = mapCurriculaDtos(response.data);
        if (db) await saveCurriculaToDb(db, courseId, mapped);
        return mapped;
      }
    } catch (e) {
      console.warn('[TauriAcademicProfileRepository] Erro ao buscar matrizes do curso via bindings Tauri:', e);
    }

    // Cache offline SQLite
    if (db) {
      try {
        const rows = await db.select<{ payload: string }[]>(
          'SELECT payload FROM curricula_cache WHERE course_id = $1 LIMIT 1;',
          [courseId]
        );
        if (rows && rows.length > 0) {
          const cached = parseCurriculumListJson(rows[0].payload);
          if (cached.length > 0) {
            return cached;
          }
        }
      } catch (e) {
        console.warn('[TauriAcademicProfileRepository] Falha ao recuperar matrizes do cache SQLite:', e);
      }
    }

    // Fallback estático
    const fromFallback = await this.fallbackRepo.getCurriculaForCourse(courseId);
    if (fromFallback.length > 0 && db) {
      await saveCurriculaToDb(db, courseId, fromFallback);
    }
    return fromFallback;
  }

  async fetchSigaaHistory(creds: SigaaCredentials): Promise<SigaaHistoryRawResponse> {
    try {
      const { commands } = await import('@/core/infrastructure/bindings');
      const response = await commands.fetchSigaaAcademicHistory(creds.matricula, creds.senha);
      if (response.status === 'ok' && response.data) {
        const d = response.data;
        const p = d.profile;
        return {
          pdfBase64: d.pdfBase64 ?? undefined,
          pdfText: d.pdfText ?? undefined,
          matricula: p.matricula,
          nome: p.name ?? undefined,
          curso: p.course,
          turno: p.shift ?? undefined,
          nivel: p.level,
          status: p.status,
          entrada: p.admissionSemester,
          email: p.email ?? undefined,
          ira: p.ira ?? undefined,
          mp: p.mp ?? undefined,
          chObrigatoriaPendente: p.pendingMandatoryHours ?? undefined,
          chOptativaPendente: p.pendingElectiveHours ?? undefined,
          chTotalCurriculo: p.totalCurriculumHours ?? undefined,
          chComplementarPendente: p.pendingComplementaryHours ?? undefined,
          percentualIntegralizado: p.completedPercentage ?? undefined,
        };
      } else if (response.status === 'error') {
        throw new Error(response.error);
      }
    } catch (e) {
      console.warn('[TauriAcademicProfileRepository] Erro ao emitir histórico via Tauri:', e);
      throw e;
    }

    return this.fallbackRepo.fetchSigaaHistory(creds);
  }
}
