import type { StudentAcademicProfile } from '../domain/entities/academic-profile';
import type { CurriculumStructure } from '../domain/entities/course';
import type { SigaaCredentials } from '../domain/entities/credential';
import type {
  IAcademicProfileRepository,
  SigaaHistoryRawResponse,
} from '../domain/interfaces/academic-profile-repo.interface';
import {
  mapCurriculumStructureDto,
  sharedDisciplineNameMap,
  type RawCurriculumStructureDto,
} from './mappers/curriculum.mapper';
import { parseAcademicProfileJson, parseCurriculumListJson } from './persistence-codec';

export { sharedDisciplineNameMap };

const STORAGE_KEY = 'sarue_academic_profile_v1';
const LEGACY_STORAGE_KEY = 'unb_aggregator_academic_profile_v1';

let sharedCurriculaCache: CurriculumStructure[] | null = null;

/** Dentro do Tauri, fetch de hosts externos pelo webview pende/mata o processo. */
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
let sharedCurriculaPromise: Promise<CurriculumStructure[]> | null = null;

// Cache por curso: course_id -> matrizes (evita re-baixar o arquivo do curso)
const sharedCurriculaByCourse = new Map<string, Promise<CurriculumStructure[]>>();

export class InMemoryAcademicProfileRepository implements IAcademicProfileRepository {
  private profileInMemory: StudentAcademicProfile | null = null;

  async getProfile(): Promise<StudentAcademicProfile | null> {
    if (this.profileInMemory) {
      return this.profileInMemory;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const parsed = parseAcademicProfileJson(raw);
          if (parsed) {
            this.profileInMemory = parsed;
            return parsed;
          }
        }
      } catch {}
    }

    return null;
  }

  async saveProfile(profile: StudentAcademicProfile): Promise<void> {
    this.profileInMemory = profile;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      } catch {}
    }
  }

  async clearProfile(): Promise<void> {
    this.profileInMemory = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {}
    }
  }

  async getAllCurricula(): Promise<CurriculumStructure[]> {
    if (sharedCurriculaCache && sharedCurriculaCache.length > 0) {
      return sharedCurriculaCache;
    }

    if (sharedCurriculaPromise) {
      return sharedCurriculaPromise;
    }

    sharedCurriculaPromise = (async () => {
      if (typeof fetch !== 'undefined') {
        const candidateUrls = isTauriRuntime()
          ? ['/data/curricula.json']
          : [
              '/data/curricula.json',
              'https://kalebhenrique.github.io/sarue-unb/data/curricula.json',
              'https://raw.githubusercontent.com/kalebhenrique/sarue-unb/gh-pages/data/curricula.json',
            ];

        for (const url of candidateUrls) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;

            const raw = (await res.json()) as RawCurriculumStructureDto[];

            if (Array.isArray(raw) && raw.length > 0) {
              const mapped: CurriculumStructure[] = [];
              const CHUNK_SIZE = 25;

              for (let i = 0; i < raw.length; i += CHUNK_SIZE) {
                const slice = raw.slice(i, i + CHUNK_SIZE);
                for (const c of slice) {
                  mapped.push(mapCurriculumStructureDto(c));
                }
                if (i + CHUNK_SIZE < raw.length) {
                  await new Promise((resolve) => setTimeout(resolve, 0));
                }
              }

              sharedCurriculaCache = mapped;
              return mapped;
            }
          } catch (e) {
            console.warn(`[InMemoryAcademicProfileRepository] Erro ao carregar currículos de ${url}:`, e);
          }
        }
      }

      return [];
    })();

    try {
      return await sharedCurriculaPromise;
    } finally {
      sharedCurriculaPromise = null;
    }
  }

  async getCurriculaForCourse(courseId: string): Promise<CurriculumStructure[]> {
    if (!courseId) return [];

    const cached = sharedCurriculaByCourse.get(courseId);
    if (cached) return cached;

    // Cache local web
    const storageKey = `sarue_curricula_course_${courseId}`;
    if (typeof localStorage !== 'undefined') {
      try {
        const rawLocal = localStorage.getItem(storageKey);
        if (rawLocal) {
          const parsed = parseCurriculumListJson(rawLocal);
          if (parsed.length > 0) {
            sharedCurriculaByCourse.set(courseId, Promise.resolve(parsed));
            return parsed;
          }
        }
      } catch {}
    }

    const promise = (async () => {
      if (typeof fetch !== 'undefined') {
        const candidateUrls = isTauriRuntime()
          ? [`/data/curricula/${courseId}.json`]
          : [
              `/data/curricula/${courseId}.json`,
              `https://kalebhenrique.github.io/sarue-unb/data/curricula/${courseId}.json`,
              `https://raw.githubusercontent.com/kalebhenrique/sarue-unb/gh-pages/data/curricula/${courseId}.json`,
            ];

        for (const url of candidateUrls) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const raw = (await res.json()) as RawCurriculumStructureDto[];
            if (Array.isArray(raw) && raw.length > 0) {
              const mapped = raw.map(mapCurriculumStructureDto);
              // Evita estourar quota do localStorage quando rodando dentro do Tauri (que já usa SQLite)
              if (!isTauriRuntime() && typeof localStorage !== 'undefined') {
                try {
                  localStorage.setItem(storageKey, JSON.stringify(mapped));
                } catch {}
              }
              return mapped;
            }
          } catch (e) {
            console.warn(`[InMemoryAcademicProfileRepository] Erro ao carregar matrizes do curso ${courseId} em ${url}:`, e);
          }
        }
      }
      return [];
    })();

    sharedCurriculaByCourse.set(courseId, promise);
    const result = await promise;
    // Falha não fica presa em cache: a próxima chamada tenta de novo
    if (result.length === 0) sharedCurriculaByCourse.delete(courseId);
    return result;
  }

  async fetchSigaaHistory(creds: SigaaCredentials): Promise<SigaaHistoryRawResponse> {
    return {
      matricula: creds.matricula,
      nome: 'Discente UnB',
      curso: 'ENGENHARIA DE COMPUTAÇÃO',
      nivel: 'GRADUAÇÃO',
      status: 'ATIVO',
      entrada: '2022.1',
    };
  }
}
