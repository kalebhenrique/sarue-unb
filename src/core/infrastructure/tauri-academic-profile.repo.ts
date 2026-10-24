import type { StudentAcademicProfile } from '../domain/entities/academic-profile';
import type { CurriculumStructure } from '../domain/entities/course';
import type { SigaaCredentials } from '../domain/entities/credential';
import type {
  IAcademicProfileRepository,
  SigaaHistoryRawResponse,
} from '../domain/interfaces/academic-profile-repo.interface';
import { InMemoryAcademicProfileRepository } from './in-memory-academic-profile.repo';
import { getDatabase } from './sqlite-feed.repo';

const PROFILE_ROW_ID = 'current';

interface CurriculumDisciplineDto {
  code: string;
  name: string;
  workload_hours: number;
  level?: number | null;
  nature: string;
  prerequisites_raw?: string | null;
  prerequisites?: string[];
  equivalences_raw?: string | null;
  equivalences?: string[];
}

interface CurriculumStructureDto {
  id: string;
  course_id: string;
  course_name: string;
  code: string;
  created_year?: string | null;
  status: string;
  shift?: string | null;
  total_hours?: number | null;
  mandatory_disciplines?: CurriculumDisciplineDto[];
  elective_disciplines?: CurriculumDisciplineDto[];
  complementary_disciplines?: CurriculumDisciplineDto[];
}

function mapCurriculaDto(dtos: CurriculumStructureDto[]): CurriculumStructure[] {
  const mapDisc = (d: CurriculumDisciplineDto) => ({
    code: d.code,
    name: d.name,
    workloadHours: d.workload_hours,
    level: d.level ?? undefined,
    nature: d.nature as 'Obrigatória' | 'Optativa' | 'Complementar',
    prerequisitesRaw: d.prerequisites_raw ?? undefined,
    prerequisites: d.prerequisites || [],
    equivalencesRaw: d.equivalences_raw ?? undefined,
    equivalences: d.equivalences || [],
  });
  return dtos.map((c) => ({
    id: c.id,
    courseId: c.course_id,
    courseName: c.course_name,
    code: c.code,
    createdYear: c.created_year ?? undefined,
    status: c.status,
    shift: c.shift ?? undefined,
    totalHours: c.total_hours ?? undefined,
    mandatoryDisciplines: (c.mandatory_disciplines || []).map(mapDisc),
    electiveDisciplines: (c.elective_disciplines || []).map(mapDisc),
    complementaryDisciplines: (c.complementary_disciplines || []).map(mapDisc),
  }));
}

let academicTableCreated = false;
async function ensureAcademicTable(db: NonNullable<Awaited<ReturnType<typeof getDatabase>>>) {
  if (!academicTableCreated) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS academic_profile (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    academicTableCreated = true;
  }
}

export class TauriAcademicProfileRepository implements IAcademicProfileRepository {
  private fallbackRepo = new InMemoryAcademicProfileRepository();

  async getProfile(): Promise<StudentAcademicProfile | null> {
    const db = await getDatabase();
    if (db) {
      try {
        await ensureAcademicTable(db);
        const rows = await db.select<{ payload: string }[]>(
          'SELECT payload FROM academic_profile WHERE id = $1 LIMIT 1;',
          [PROFILE_ROW_ID]
        );
        if (rows && rows.length > 0) {
          const parsed = JSON.parse(rows[0].payload) as StudentAcademicProfile;
          if (parsed && typeof parsed.matricula === 'string') {
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
        await ensureAcademicTable(db);
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
        await ensureAcademicTable(db);
        await db.execute('DELETE FROM academic_profile WHERE id = $1;', [PROFILE_ROW_ID]);
      } catch (e) {
        console.warn('[TauriAcademicProfileRepository] Falha ao limpar perfil no SQLite:', e);
      }
    }
  }

  async getAllCurricula(): Promise<CurriculumStructure[]> {
    // Carrega via fetch('/data/curricula.json') em chunks não-bloqueantes com cache compartilhado,
    // evitando serializar 40 MB via evaluateJavaScript na Main Thread do macOS (WKWebView).
    const fromStaticAsset = await this.fallbackRepo.getAllCurricula();
    if (fromStaticAsset.length > 0) {
      return fromStaticAsset;
    }

    try {
      const { commands } = await import('@/core/infrastructure/bindings');
      const response = await commands.getAllCurricula();
      if (response.status === 'ok' && response.data && response.data.length > 0) {
        return mapCurriculaDto(response.data);
      }
    } catch (e) {
      console.warn('[TauriAcademicProfileRepository] Erro ao buscar via bindings Tauri:', e);
    }

    return [];
  }

  async getCurriculaForCourse(courseId: string): Promise<CurriculumStructure[]> {
    try {
      const { commands } = await import('@/core/infrastructure/bindings');
      const response = await commands.getCourseCurriculum(courseId);
      if (response.status === 'ok' && response.data && response.data.length > 0) {
        return mapCurriculaDto(response.data);
      }
    } catch (e) {
      console.warn('[TauriAcademicProfileRepository] Erro ao buscar matrizes do curso via bindings Tauri:', e);
    }
    return this.fallbackRepo.getCurriculaForCourse(courseId);
  }

  async fetchSigaaHistory(creds: SigaaCredentials): Promise<SigaaHistoryRawResponse> {
    try {
      const { commands } = await import('@/core/infrastructure/bindings');
      const response = await commands.fetchSigaaAcademicHistory(creds.matricula, creds.senha);
      if (response.status === 'ok' && response.data) {
        const d = response.data;
        return {
          pdfBase64: d.pdfBase64 ?? undefined,
          pdfText: d.pdfText ?? undefined,
          matricula: d.profile.matricula,
          nome: d.profile.nome ?? undefined,
          curso: d.profile.curso,
          nivel: d.profile.nivel,
          status: d.profile.status,
          entrada: d.profile.entrada,
          email: d.profile.email ?? undefined,
          ira: d.profile.ira ?? undefined,
          mp: d.profile.mp ?? undefined,
          chObrigatoriaPendente: d.profile.chObrigatoriaPendente ?? undefined,
          chOptativaPendente: d.profile.chOptativaPendente ?? undefined,
          chTotalCurriculo: d.profile.chTotalCurriculo ?? undefined,
          chComplementarPendente: d.profile.chComplementarPendente ?? undefined,
          percentualIntegralizado: d.profile.percentualIntegralizado ?? undefined,
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
