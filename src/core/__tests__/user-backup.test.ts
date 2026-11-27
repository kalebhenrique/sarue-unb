import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BACKUP_APP_ID,
  BACKUP_MAX_FILE_BYTES,
  BACKUP_SCHEMA_VERSION,
  applyUserBackup,
  clearAllLocalUserData,
  collectUserBackup,
  getDisciplineAbsenceOverride,
  getDisciplineGradeData,
  parseUserBackupJson,
  resetDisciplineUserDataCacheForTests,
  saveDisciplineAbsenceOverride,
  saveDisciplineGradeData,
  type SavedGrade,
  type StudentAcademicProfile,
  type UserCalendarEvent,
} from '@/core';
import { InMemoryAcademicProfileRepository } from '../infrastructure/in-memory-academic-profile.repo';
import { InMemoryUserEventsRepository } from '../infrastructure/in-memory-user-events.repo';
import { InMemoryIraScenarioRepository } from '../infrastructure/in-memory-ira-scenario.repo';
import { InMemoryFeedRepository } from '../infrastructure/in-memory-feed.repo';
import { InMemoryGradeRepository } from '../infrastructure/in-memory-grade.repo';
import { STORAGE_KEYS } from '@/lib/storage-keys';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

function createTestRepos() {
  return {
    academicProfileRepo: new InMemoryAcademicProfileRepository(),
    userEventsRepo: new InMemoryUserEventsRepository(),
    iraScenarioRepo: new InMemoryIraScenarioRepository(),
    feedRepo: new InMemoryFeedRepository(),
    gradeRepo: new InMemoryGradeRepository(),
  };
}

describe('user-backup.service', () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });
    resetDisciplineUserDataCacheForTests();
  });

  it('exporta todas as 8 categorias sem vazar CPF, matrícula ou histórico oficial do SIGAA', async () => {
    const repos = createTestRepos();

    const profile: StudentAcademicProfile = {
      matricula: '211039999',
      cpf: '12345678901',
      studentName: 'Estudante UnB',
      courseName: 'ENGENHARIA DE SOFTWARE',
      level: 'GRADUAÇÃO',
      admissionYear: '2021/1',
      userSelectedCourseName: 'CIÊNCIA DA COMPUTAÇÃO',
      userSelectedCurriculumId: 'curr-cc-1',
      userSelectedCurriculumCode: '6351/2',
      completedDisciplines: [
        { code: 'CIC0004', name: 'APC', isCompleted: true, grade: 'SS' },
      ],
      manualCompletedCodes: ['MAT0025'],
      manualUncompletedCodes: ['CIC0090'],
      updatedAt: '2026-11-27T10:00:00.000Z',
    };
    await repos.academicProfileRepo.saveProfile(profile);

    await saveDisciplineGradeData('sigaa-cic0004', {
      formula: '(P1 + P2) / 2',
      values: { P1: 8.5, P2: 9.0 },
    });
    saveDisciplineAbsenceOverride('sigaa-cic0004', 2);

    const calendarEvent: UserCalendarEvent = {
      id: 'ev-1',
      title: 'Prova de Cálculo 1',
      date: '2026-12-05',
      allDay: false,
      startTime: '10:00',
      endTime: '12:00',
      category: 'exam',
      createdAt: '2026-11-27T10:00:00.000Z',
      updatedAt: '2026-11-27T10:00:00.000Z',
    };
    await repos.userEventsRepo.saveEvent(calendarEvent);

    const savedGrade: SavedGrade = {
      id: 'grade-2027-1',
      name: 'Grade Principal',
      semester: '2027-1',
      selectedClasses: [
        {
          id: 'CIC0004-01',
          disciplineCode: 'CIC0004',
          disciplineName: 'Algoritmos e Programação',
          classCode: '01',
          teachers: ['Prof. Teste'],
          classroom: 'PAT AT 012',
          scheduleCode: '24M12',
          scheduleSlots: [],
        },
      ],
      updatedAt: '2026-11-27T10:00:00.000Z',
    };
    await repos.gradeRepo.saveGrade(savedGrade);

    await repos.iraScenarioRepo.saveScenario({
      semesters: [
        {
          id: 'sem-1',
          label: '2027.1',
          period: '2027.1',
          kind: 'future',
          disciplines: [
            {
              id: 'd-1',
              code: 'CIC0105',
              name: 'EDA',
              credits: 4,
              mention: 'SS',
              origin: 'added',
            },
          ],
        },
      ],
      baseTrancadasObrigatorias: 0,
      baseTrancadasOptativas: 0,
      extraTrancadasObrigatorias: 1,
      extraTrancadasOptativas: 0,
      updatedAt: '2026-11-27T10:00:00.000Z',
    });

    await repos.feedRepo.saveAssociation({
      aprenderCourseId: 'aprender-42',
      sigaaCourseId: 'sigaa-cic0004',
      isIgnored: false,
    });

    await repos.feedRepo.saveItems([
      {
        id: 'feed-1',
        platform: 'aprender3',
        title: 'Lista 1',
        content: 'Entregar PDF',
        courseName: 'APC',
        itemType: 'assignment',
        createdAt: '2026-11-20T10:00:00.000Z',
        isCompleted: true,
        isArchived: false,
      },
    ]);

    localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
    localStorage.setItem(STORAGE_KEYS.UI_ZOOM, '1.1');

    const payload = await collectUserBackup({ repos, appVersion: '0.5.2' });
    const serialized = JSON.stringify(payload);

    // Segurança: nenhum dado pessoal sensível pode aparecer no JSON
    expect(serialized).not.toContain('211039999');
    expect(serialized).not.toContain('12345678901');
    expect(serialized).not.toContain('Estudante UnB');

    const parsed = parseUserBackupJson(serialized);
    expect(parsed.payload.app).toBe(BACKUP_APP_ID);
    expect(parsed.payload.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.availableCategories).toEqual([
      'curriculum',
      'disciplineGrades',
      'calendarEvents',
      'savedGrades',
      'iraScenario',
      'courseAssociations',
      'feedStates',
      'settings',
    ]);
  });

  it('restaura em modo merge preservando dados locais existentes e dados oficiais do SIGAA', async () => {
    const sourceRepos = createTestRepos();
    await sourceRepos.academicProfileRepo.saveProfile({
      matricula: '211030001',
      courseName: 'ENGENHARIA',
      level: 'GRADUAÇÃO',
      admissionYear: '2021/1',
      userSelectedCurriculumId: 'curr-alt',
      completedDisciplines: [],
      manualCompletedCodes: ['MAT0025'],
      manualUncompletedCodes: [],
      updatedAt: '2026-11-27T10:00:00.000Z',
    });
    await sourceRepos.userEventsRepo.saveEvent({
      id: 'ev-from-backup',
      title: 'Evento do Backup',
      date: '2026-12-10',
      allDay: true,
      category: 'personal',
      createdAt: '2026-11-27T10:00:00.000Z',
      updatedAt: '2026-11-27T10:00:00.000Z',
    });
    await saveDisciplineGradeData('disc-backup', {
      formula: '(P1 + P2) / 2',
      values: { P1: 7.5 },
    });

    const payload = await collectUserBackup({
      repos: sourceRepos,
      appVersion: '0.5.2',
    });
    const parsed = parseUserBackupJson(JSON.stringify(payload));

    // Novo dispositivo já possui perfil SIGAA oficial + evento local + nota local
    resetDisciplineUserDataCacheForTests();
    const targetStorage = createMemoryStorage();
    vi.stubGlobal('localStorage', targetStorage);
    vi.stubGlobal('window', { localStorage: targetStorage });

    const targetRepos = createTestRepos();
    await targetRepos.academicProfileRepo.saveProfile({
      matricula: '222099999',
      cpf: '99988877766',
      studentName: 'Outro Dispositivo',
      courseName: 'ENGENHARIA DE SOFTWARE',
      level: 'GRADUAÇÃO',
      admissionYear: '2022/2',
      completedDisciplines: [
        { code: 'CIC0004', name: 'APC', isCompleted: true, grade: 'MS' },
      ],
      manualCompletedCodes: ['FIS0032'],
      manualUncompletedCodes: [],
      updatedAt: '2026-11-26T10:00:00.000Z',
    });
    await targetRepos.userEventsRepo.saveEvent({
      id: 'ev-local',
      title: 'Evento Local',
      date: '2026-12-01',
      allDay: true,
      category: 'study',
      createdAt: '2026-11-26T10:00:00.000Z',
      updatedAt: '2026-11-26T10:00:00.000Z',
    });
    await saveDisciplineGradeData('disc-local', {
      formula: '(P1 + P2) / 2',
      values: { P1: 9.0 },
    });

    await applyUserBackup(
      parsed,
      {
        mode: 'merge',
        categories: ['curriculum', 'disciplineGrades', 'calendarEvents'],
      },
      { repos: targetRepos },
    );

    const mergedProfile = await targetRepos.academicProfileRepo.getProfile();
    expect(mergedProfile?.matricula).toBe('222099999');
    expect(mergedProfile?.cpf).toBe('99988877766');
    expect(mergedProfile?.completedDisciplines).toHaveLength(1);
    expect(mergedProfile?.userSelectedCurriculumId).toBe('curr-alt');
    expect(mergedProfile?.manualCompletedCodes).toEqual(
      expect.arrayContaining(['FIS0032', 'MAT0025']),
    );

    const events = await targetRepos.userEventsRepo.getEvents();
    expect(events.map((e) => e.id).sort()).toEqual([
      'ev-from-backup',
      'ev-local',
    ]);

    expect(getDisciplineGradeData('disc-local')?.values.P1).toBe(9.0);
    expect(getDisciplineGradeData('disc-backup')?.values.P1).toBe(7.5);
  });

  it('restaura em modo replace substituindo apenas as categorias selecionadas', async () => {
    const repos = createTestRepos();
    await repos.userEventsRepo.saveEvent({
      id: 'ev-old',
      title: 'Evento Antigo',
      date: '2026-12-01',
      allDay: true,
      category: 'personal',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    });
    saveDisciplineAbsenceOverride('disc-keep', 4);

    const backupJson = JSON.stringify({
      app: BACKUP_APP_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: '0.5.2',
      exportedAt: '2026-11-27T12:00:00.000Z',
      data: {
        calendarEvents: [
          {
            id: 'ev-new',
            title: 'Evento Novo',
            date: '2026-12-20',
            allDay: true,
            category: 'exam',
            createdAt: '2026-11-27T12:00:00.000Z',
            updatedAt: '2026-11-27T12:00:00.000Z',
          },
        ],
        disciplineGrades: {
          'disc-new': {
            absenceOverride: 1,
            updatedAt: '2026-11-27T12:00:00.000Z',
          },
        },
      },
    });

    const parsed = parseUserBackupJson(backupJson);

    // Restaura SOMENTE calendarEvents em modo replace; disciplineGrades deve ficar intacto
    await applyUserBackup(
      parsed,
      {
        mode: 'replace',
        categories: ['calendarEvents'],
      },
      { repos },
    );

    const events = await repos.userEventsRepo.getEvents();
    expect(events.map((e) => e.id)).toEqual(['ev-new']);
    expect(getDisciplineAbsenceOverride('disc-keep')).toBe(4);
    expect(getDisciplineAbsenceOverride('disc-new')).toBeNull();
  });

  it('rejeita arquivos inválidos, de outro app, versão futura ou acima de 10 MB', () => {
    expect(() => parseUserBackupJson('')).toThrow(/vazio/i);
    expect(() => parseUserBackupJson('{not json')).toThrow(/JSON válido/i);
    expect(() =>
      parseUserBackupJson(
        JSON.stringify({ app: 'other-app', schemaVersion: 1, data: {} }),
      ),
    ).toThrow(/Saruê UnB/i);
    expect(() =>
      parseUserBackupJson(
        JSON.stringify({
          app: BACKUP_APP_ID,
          schemaVersion: BACKUP_SCHEMA_VERSION + 1,
          data: {},
        }),
      ),
    ).toThrow(/versão mais recente/i);
    expect(() =>
      parseUserBackupJson(
        JSON.stringify({
          app: BACKUP_APP_ID,
          schemaVersion: BACKUP_SCHEMA_VERSION,
          data: {},
        }),
      ),
    ).toThrow(/não possui dados/i);

    const huge = 'a'.repeat(BACKUP_MAX_FILE_BYTES + 10);
    expect(() => parseUserBackupJson(huge)).toThrow(/10 MB/i);
  });

  it('clearAllLocalUserData apaga notas, faltas (incluindo chaves legadas) e eventos do calendário', async () => {
    const repos = createTestRepos();
    await saveDisciplineGradeData('sigaa-1', {
      formula: '(P1 + P2) / 2',
      values: { P1: 8.0 },
    });
    saveDisciplineAbsenceOverride('sigaa-1', 3);
    await repos.userEventsRepo.saveEvent({
      id: 'ev-wipe',
      title: 'Evento para apagar',
      date: '2026-12-15',
      allDay: true,
      category: 'personal',
      createdAt: '2026-11-27T10:00:00.000Z',
      updatedAt: '2026-11-27T10:00:00.000Z',
    });

    const backup = await collectUserBackup({ repos, appVersion: '0.5.2' });

    await clearAllLocalUserData(repos);

    expect(getDisciplineGradeData('sigaa-1').found).toBe(false);
    expect(getDisciplineGradeData('sigaa-1').values).toEqual({});
    expect(getDisciplineAbsenceOverride('sigaa-1')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.DISCIPLINE_GRADES)).toBeNull();
    expect(
      localStorage.getItem('sarue:discipline_grades:sigaa-1:values'),
    ).toBeNull();
    expect(
      localStorage.getItem('sarue:discipline_absences:sigaa-1:override'),
    ).toBeNull();
    expect(await repos.userEventsRepo.getEvents()).toEqual([]);

    // Reimportar o backup restaura tudo após a limpeza
    const parsed = parseUserBackupJson(JSON.stringify(backup));
    await applyUserBackup(
      parsed,
      {
        mode: 'replace',
        categories: ['disciplineGrades', 'calendarEvents'],
      },
      { repos },
    );

    expect(getDisciplineGradeData('sigaa-1')?.values.P1).toBe(8.0);
    expect(getDisciplineAbsenceOverride('sigaa-1')).toBe(3);
    expect((await repos.userEventsRepo.getEvents()).map((e) => e.id)).toEqual([
      'ev-wipe',
    ]);
  });
});
