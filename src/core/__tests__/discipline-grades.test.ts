import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Discipline } from '../domain/entities/course';
import {
  DEFAULT_GRADE_FORMULA,
  DISCIPLINE_USER_DATA_SQLITE_KEY,
  getDisciplineAbsenceOverride,
  getDisciplineGradeData,
  loadDisciplineUserData,
  resetDisciplineUserDataCacheForTests,
  resolveDisciplineStorageKeys,
  saveDisciplineAbsenceOverride,
  saveDisciplineGradeData,
} from '../infrastructure/discipline-grades.service';

const mockDbStore = new Map<string, string>();
const mockDb = {
  select: vi.fn(async (_sql: string, params?: unknown[]) => {
    const key = String(params?.[0] ?? '');
    const value = mockDbStore.get(key);
    return value ? [{ value }] : [];
  }),
  execute: vi.fn(async (_sql: string, params?: unknown[]) => {
    const key = String(params?.[0] ?? '');
    const value = String(params?.[1] ?? '');
    mockDbStore.set(key, value);
    return { rowsAffected: 1 };
  }),
};

vi.mock('../infrastructure/sqlite-feed.repo', () => ({
  getDatabase: vi.fn(async () => mockDb),
}));

function installMockLocalStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  globalThis.window = {
    localStorage: storage,
  } as unknown as Window & typeof globalThis;
  return store;
}

const SAMPLE_DISCIPLINE_SIGAA: Discipline = {
  id: 'sigaa-99999',
  code: 'CIC0004',
  name: 'Algoritmos e Programação de Computadores',
  semester: '2026.2',
  sigaaCourse: {
    id: 'sigaa-99999',
    code: 'CIC0004',
    name: 'Algoritmos e Programação de Computadores',
    semester: '2026.2',
    platform: 'sigaa',
  },
  aprenderCourses: [
    {
      id: 'aprender-12345',
      code: 'CIC0004',
      name: 'APC',
      semester: '2026.2',
      platform: 'aprender3',
    },
  ],
  teamsCourses: [],
};

describe('discipline-grades.service (SQLite + localStorage + resilient keys)', () => {
  let localStore: Map<string, string>;

  beforeEach(() => {
    mockDbStore.clear();
    mockDb.select.mockClear();
    mockDb.execute.mockClear();
    resetDisciplineUserDataCacheForTests();
    localStore = installMockLocalStorage();
  });

  it('migra chaves legadas de notas e faltas do localStorage para o SQLite', async () => {
    localStore.set(
      'sarue:discipline_grades:sigaa-99999:formula',
      '0.4 * P1 + 0.6 * P2',
    );
    localStore.set(
      'sarue:discipline_grades:sigaa-99999:values',
      JSON.stringify({ P1: 8.5, P2: 7.0 }),
    );
    localStore.set('sarue:discipline_absences:sigaa-99999:override', '4');

    await loadDisciplineUserData();

    expect(mockDbStore.has(DISCIPLINE_USER_DATA_SQLITE_KEY)).toBe(true);
    expect(getDisciplineGradeData(SAMPLE_DISCIPLINE_SIGAA)).toEqual({
      formula: '0.4 * P1 + 0.6 * P2',
      values: { P1: 8.5, P2: 7.0 },
      found: true,
    });
    expect(getDisciplineAbsenceOverride(SAMPLE_DISCIPLINE_SIGAA)).toBe(4);
  });

  it('recupera notas e faltas do SQLite mesmo quando localStorage é limpo após update', async () => {
    await saveDisciplineGradeData(SAMPLE_DISCIPLINE_SIGAA, {
      formula: '(P1 + P2 + P3) / 3',
      values: { P1: 9.0, P2: 6.5, P3: null },
    });
    saveDisciplineAbsenceOverride(SAMPLE_DISCIPLINE_SIGAA, 2);

    // Simula atualização do app que apaga o localStorage do WebView preservando sarue_unb.db
    localStore.clear();
    resetDisciplineUserDataCacheForTests();

    await loadDisciplineUserData();

    expect(getDisciplineGradeData(SAMPLE_DISCIPLINE_SIGAA)).toEqual({
      formula: '(P1 + P2 + P3) / 3',
      values: { P1: 9.0, P2: 6.5, P3: null },
      found: true,
    });
    expect(getDisciplineAbsenceOverride(SAMPLE_DISCIPLINE_SIGAA)).toBe(2);
  });

  it('recupera notas quando discipline.id muda de aprender-* para sigaa-* após reconectar SIGAA', async () => {
    const aprenderOnly: Discipline = {
      ...SAMPLE_DISCIPLINE_SIGAA,
      id: 'aprender-12345',
      sigaaCourse: undefined,
    };

    await saveDisciplineGradeData(aprenderOnly, {
      formula: '(P1 + P2) / 2',
      values: { P1: 7.5 },
    });

    const keys = resolveDisciplineStorageKeys(SAMPLE_DISCIPLINE_SIGAA);
    expect(keys).toContain('sigaa-99999');
    expect(keys).toContain('aprender-12345');
    expect(keys).toContain('code:CIC0004:2026.2');

    // Agora a disciplina passa a ter ID do SIGAA
    const loaded = getDisciplineGradeData(SAMPLE_DISCIPLINE_SIGAA);
    expect(loaded.found).toBe(true);
    expect(loaded.values).toEqual({ P1: 7.5 });
    expect(loaded.formula).toBe(DEFAULT_GRADE_FORMULA);
  });
});
