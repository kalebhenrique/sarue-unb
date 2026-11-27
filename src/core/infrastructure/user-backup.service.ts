import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  THEME_MODES,
  applyTheme,
  getThemeMode,
  setThemeModePersistence,
  type ThemeMode,
} from '@/lib/theme';
import {
  UI_ZOOM_VALUES,
  applyUiZoom,
  getReducedMotionPreference,
  getUiZoom,
  setReducedMotionPreference,
  type UiZoom,
} from '@/lib/accessibility';
import { isSoundEffectsEnabled, setSoundEffectsEnabled } from '@/lib/sound-effects';
import { setRuHiddenInDesktopSidebar } from '@/hooks/useDesktopRuSidebar';
import { isMobileDevice } from '@/lib/platform';
import {
  BACKUP_APP_ID,
  BACKUP_CATEGORY_ORDER,
  BACKUP_MAX_FILE_BYTES,
  BACKUP_SCHEMA_VERSION,
  type BackupCategoryKey,
  type BackupCategorySummaryItem,
  type ParsedUserBackup,
  type UserBackupCourseAssociation,
  type UserBackupCurriculumOverrides,
  type UserBackupData,
  type UserBackupFeedItemState,
  type UserBackupImportOptions,
  type UserBackupImportResult,
  type UserBackupPayload,
  type UserBackupSettings,
} from '../domain/entities/user-backup';
import type { SavedGrade } from '../domain/entities/grade';
import type { StudentAcademicProfile } from '../domain/entities/academic-profile';
import type { CalendarEventCategory, UserCalendarEvent } from '../domain/entities/user-calendar-event';
import { normalizeNotificationSettings } from '../domain/entities/notification-settings';
import type { Repositories } from '../container';
import { getDatabase } from './sqlite-feed.repo';
import {
  clearAllDisciplineUserData,
  exportAllDisciplineUserData,
  importDisciplineUserData,
  sanitizeDisciplineUserDataMap,
  type DisciplineUserDataMap,
} from './discipline-grades.service';
import {
  getNotificationSettings,
  saveNotificationSettings,
} from './notification-settings.service';
import { syncRuMenuNotifications } from './ru-notification.service';
import { CAMPUS_STORAGE_KEY, getSavedRuCampus } from './ru-wallet.service';
import { RU_CAMPUSES } from '../domain/utils/ru-menu-formatter';
import {
  normalizeCurriculumStructure,
  parseIraScenarioJson,
  parseSavedGradeClassesJson,
} from './persistence-codec';

const GRADE_SHIFT_STORAGE_KEY = 'sarue_grade_shift';

const VALID_CALENDAR_CATEGORIES = new Set<CalendarEventCategory>([
  'exam',
  'assignment',
  'class',
  'study',
  'meeting',
  'personal',
  'academic',
]);

export interface BackupServiceDeps {
  repos: Pick<
    Repositories,
    'academicProfileRepo' | 'userEventsRepo' | 'iraScenarioRepo' | 'feedRepo' | 'gradeRepo'
  >;
  appVersion: string;
}

function asOptionalString(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim().length > 0 ? val : undefined;
}

function uniqueStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
  }
  return out;
}

function hasCurriculumOverrides(
  overrides: UserBackupCurriculumOverrides | null | undefined,
): boolean {
  if (!overrides) return false;
  return Boolean(
    overrides.userSelectedCourseName ||
      overrides.userSelectedCurriculumId ||
      overrides.userSelectedCurriculumCode ||
      overrides.customCurriculum ||
      overrides.manualCompletedCodes.length > 0 ||
      overrides.manualUncompletedCodes.length > 0,
  );
}

function extractCurriculumOverrides(
  profile: StudentAcademicProfile | null,
): UserBackupCurriculumOverrides | null {
  if (!profile) return null;
  const overrides: UserBackupCurriculumOverrides = {
    ...(profile.userSelectedCourseName
      ? { userSelectedCourseName: profile.userSelectedCourseName }
      : {}),
    ...(profile.userSelectedCurriculumId
      ? { userSelectedCurriculumId: profile.userSelectedCurriculumId }
      : {}),
    ...(profile.userSelectedCurriculumCode
      ? { userSelectedCurriculumCode: profile.userSelectedCurriculumCode }
      : {}),
    ...(profile.customCurriculum
      ? { customCurriculum: profile.customCurriculum }
      : {}),
    manualCompletedCodes: [...(profile.manualCompletedCodes ?? [])],
    manualUncompletedCodes: [...(profile.manualUncompletedCodes ?? [])],
  };
  return hasCurriculumOverrides(overrides) ? overrides : null;
}

async function readAllSavedGrades(
  gradeRepo: Repositories['gradeRepo'],
): Promise<SavedGrade[]> {
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.select<
        Array<{
          id: string;
          name: string;
          semester: string;
          data: string;
          updated_at: string;
        }>
      >('SELECT id, name, semester, data, updated_at FROM saved_grades ORDER BY updated_at DESC;');
      if (rows && rows.length > 0) {
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          semester: row.semester,
          selectedClasses: parseSavedGradeClassesJson(row.data),
          updatedAt: row.updated_at,
        }));
      }
      return [];
    } catch (e) {
      console.warn('[user-backup] Falha ao ler saved_grades do SQLite:', e);
    }
  }
  const latest = await gradeRepo.getSavedGrade();
  return latest ? [latest] : [];
}

async function readManualFeedStates(
  feedRepo: Repositories['feedRepo'],
): Promise<UserBackupFeedItemState[]> {
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.select<
        Array<{ id: string; is_completed: number; is_hidden: number }>
      >('SELECT id, is_completed, is_hidden FROM feed_items WHERE is_completed = 1 OR is_hidden = 1;');
      return (rows ?? []).map((r) => ({
        id: r.id,
        isCompleted: Boolean(r.is_completed),
        isArchived: Boolean(r.is_hidden),
      }));
    } catch (e) {
      console.warn('[user-backup] Falha ao ler estados de feed_items:', e);
    }
  }

  const allItems = await feedRepo.getItems({ includeArchived: true });
  return allItems
    .filter((item) => item.isCompleted || item.isArchived)
    .map((item) => ({
      id: item.id,
      isCompleted: Boolean(item.isCompleted),
      isArchived: Boolean(item.isArchived),
    }));
}

function readLocalSettings(): UserBackupSettings {
  const settings: UserBackupSettings = {
    theme: getThemeMode(),
    uiZoom: getUiZoom(),
    reduceAnimations: getReducedMotionPreference(),
    soundEffects: isSoundEffectsEnabled(),
    ruCampus: getSavedRuCampus(),
    notificationSettings: getNotificationSettings(),
  };

  if (typeof window !== 'undefined') {
    try {
      const hideRu = window.localStorage.getItem(
        STORAGE_KEYS.HIDE_RU_DESKTOP_SIDEBAR,
      );
      if (hideRu !== null) {
        settings.hideRuDesktopSidebar = hideRu === 'true';
      }

      const wifiOnly = window.localStorage.getItem(
        STORAGE_KEYS.SYNC_ONLY_ON_WIFI,
      );
      if (wifiOnly !== null) {
        settings.syncOnlyOnWifi = wifiOnly === 'true';
      }

      const bgRun = window.localStorage.getItem(STORAGE_KEYS.BACKGROUND_RUN);
      if (bgRun !== null) {
        settings.backgroundRun = bgRun === 'true';
      }

      const autostart = window.localStorage.getItem(STORAGE_KEYS.AUTOSTART);
      if (autostart !== null) {
        settings.autostart = autostart === 'true';
      }

      const evalFilter = window.localStorage.getItem(
        STORAGE_KEYS.EVALUATIONS_FILTER_BY_COURSE,
      );
      if (evalFilter !== null) {
        settings.evaluationsFilterByCourse = evalFilter !== 'false';
      }

      const gradeShift = window.localStorage.getItem(GRADE_SHIFT_STORAGE_KEY);
      if (gradeShift) {
        settings.gradeShift = gradeShift;
      }

      const openSemestersRaw = window.localStorage.getItem(
        STORAGE_KEYS.FLOWCHART_OPEN_SEMESTERS,
      );
      if (openSemestersRaw) {
        const parsed = JSON.parse(openSemestersRaw);
        if (Array.isArray(parsed)) {
          const nums = parsed.filter(
            (n): n is number => typeof n === 'number' && Number.isFinite(n),
          );
          if (nums.length > 0) {
            settings.flowchartOpenSemesters = nums;
          }
        }
      }
    } catch {
      // Ignora falhas pontuais de leitura do localStorage
    }
  }

  return settings;
}

/**
 * Coleta todos os dados locais criados/editados manualmente pelo usuário.
 * Nunca inclui credenciais, CPF, carteira estudantil ou caches externos.
 */
export async function collectUserBackup(
  deps: BackupServiceDeps,
): Promise<UserBackupPayload> {
  const [
    profile,
    disciplineGrades,
    calendarEvents,
    savedGrades,
    iraScenario,
    associations,
    feedStates,
  ] = await Promise.all([
    deps.repos.academicProfileRepo.getProfile(),
    exportAllDisciplineUserData(),
    deps.repos.userEventsRepo.getEvents(),
    readAllSavedGrades(deps.repos.gradeRepo),
    deps.repos.iraScenarioRepo.getScenario(),
    deps.repos.feedRepo.getAssociations(),
    readManualFeedStates(deps.repos.feedRepo),
  ]);

  const curriculum = extractCurriculumOverrides(profile);
  const courseAssociations: UserBackupCourseAssociation[] = associations.map(
    (a) => ({
      aprenderCourseId: a.aprenderCourseId,
      ...(a.sigaaCourseId ? { sigaaCourseId: a.sigaaCourseId } : {}),
      isIgnored: Boolean(a.isIgnored),
    }),
  );

  const settings = readLocalSettings();

  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: deps.appVersion || '0.0.0',
    exportedAt: new Date().toISOString(),
    data: {
      ...(curriculum ? { curriculum } : {}),
      ...(Object.keys(disciplineGrades).length > 0 ? { disciplineGrades } : {}),
      ...(calendarEvents.length > 0 ? { calendarEvents } : {}),
      ...(savedGrades.length > 0 ? { savedGrades } : {}),
      ...(iraScenario ? { iraScenario } : {}),
      ...(courseAssociations.length > 0 ? { courseAssociations } : {}),
      ...(feedStates.length > 0 ? { feedStates } : {}),
      settings,
    },
  };
}

function sanitizeCalendarEvents(raw: unknown): UserCalendarEvent[] {
  if (!Array.isArray(raw)) return [];
  const nowIso = new Date().toISOString();
  const events: UserCalendarEvent[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = asOptionalString(obj.id);
    const title = asOptionalString(obj.title);
    const date = asOptionalString(obj.date);
    if (!id || !title || !date) continue;

    const categoryRaw = typeof obj.category === 'string' ? obj.category : 'personal';
    const category: CalendarEventCategory = VALID_CALENDAR_CATEGORIES.has(
      categoryRaw as CalendarEventCategory,
    )
      ? (categoryRaw as CalendarEventCategory)
      : 'personal';

    events.push({
      id,
      title,
      description: asOptionalString(obj.description),
      date,
      endDate: asOptionalString(obj.endDate),
      startTime: asOptionalString(obj.startTime),
      endTime: asOptionalString(obj.endTime),
      allDay: obj.allDay !== false,
      category,
      courseId: asOptionalString(obj.courseId),
      courseCode: asOptionalString(obj.courseCode),
      courseName: asOptionalString(obj.courseName),
      location: asOptionalString(obj.location),
      notify: obj.notify !== false,
      isCompleted: Boolean(obj.isCompleted),
      createdAt: asOptionalString(obj.createdAt) ?? nowIso,
      updatedAt: asOptionalString(obj.updatedAt) ?? nowIso,
    });
  }

  return events;
}

function sanitizeSavedGrades(raw: unknown): SavedGrade[] {
  if (!Array.isArray(raw)) return [];
  const nowIso = new Date().toISOString();
  const out: SavedGrade[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = asOptionalString(obj.id);
    const semester = asOptionalString(obj.semester);
    if (!id || !semester) continue;

    const classes = parseSavedGradeClassesJson(
      JSON.stringify(obj.selectedClasses ?? []),
    );
    out.push({
      id,
      name: asOptionalString(obj.name) ?? `Grade ${semester}`,
      semester,
      selectedClasses: classes,
      updatedAt: asOptionalString(obj.updatedAt) ?? nowIso,
    });
  }

  return out;
}

function sanitizeCourseAssociations(raw: unknown): UserBackupCourseAssociation[] {
  if (!Array.isArray(raw)) return [];
  const out: UserBackupCourseAssociation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const aprenderCourseId = asOptionalString(obj.aprenderCourseId);
    if (!aprenderCourseId) continue;
    out.push({
      aprenderCourseId,
      sigaaCourseId: asOptionalString(obj.sigaaCourseId),
      isIgnored: Boolean(obj.isIgnored),
    });
  }
  return out;
}

function sanitizeFeedStates(raw: unknown): UserBackupFeedItemState[] {
  if (!Array.isArray(raw)) return [];
  const out: UserBackupFeedItemState[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = asOptionalString(obj.id);
    if (!id) continue;
    const isCompleted = Boolean(obj.isCompleted);
    const isArchived = Boolean(obj.isArchived);
    if (!isCompleted && !isArchived) continue;
    out.push({ id, isCompleted, isArchived });
  }
  return out;
}

function sanitizeCurriculum(
  raw: unknown,
): UserBackupCurriculumOverrides | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const customCurriculum = obj.customCurriculum
    ? normalizeCurriculumStructure(obj.customCurriculum) ?? undefined
    : undefined;
  const overrides: UserBackupCurriculumOverrides = {
    userSelectedCourseName: asOptionalString(obj.userSelectedCourseName),
    userSelectedCurriculumId: asOptionalString(obj.userSelectedCurriculumId),
    userSelectedCurriculumCode: asOptionalString(obj.userSelectedCurriculumCode),
    customCurriculum,
    manualCompletedCodes: uniqueStringArray(obj.manualCompletedCodes),
    manualUncompletedCodes: uniqueStringArray(obj.manualUncompletedCodes),
  };
  return hasCurriculumOverrides(overrides) ? overrides : null;
}

function sanitizeSettings(raw: unknown): UserBackupSettings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const settings: UserBackupSettings = {};

  if (typeof obj.theme === 'string' && THEME_MODES.includes(obj.theme as ThemeMode)) {
    settings.theme = obj.theme as ThemeMode;
  }
  if (typeof obj.uiZoom === 'number' && UI_ZOOM_VALUES.includes(obj.uiZoom as UiZoom)) {
    settings.uiZoom = obj.uiZoom as UiZoom;
  }
  if (typeof obj.reduceAnimations === 'boolean') {
    settings.reduceAnimations = obj.reduceAnimations;
  }
  if (typeof obj.soundEffects === 'boolean') {
    settings.soundEffects = obj.soundEffects;
  }
  if (typeof obj.hideRuDesktopSidebar === 'boolean') {
    settings.hideRuDesktopSidebar = obj.hideRuDesktopSidebar;
  }
  if (
    typeof obj.ruCampus === 'string' &&
    (RU_CAMPUSES as readonly string[]).includes(obj.ruCampus)
  ) {
    settings.ruCampus = obj.ruCampus;
  }
  if (obj.notificationSettings && typeof obj.notificationSettings === 'object') {
    settings.notificationSettings = normalizeNotificationSettings(
      obj.notificationSettings,
    );
  }
  if (typeof obj.syncOnlyOnWifi === 'boolean') {
    settings.syncOnlyOnWifi = obj.syncOnlyOnWifi;
  }
  if (typeof obj.backgroundRun === 'boolean') {
    settings.backgroundRun = obj.backgroundRun;
  }
  if (typeof obj.autostart === 'boolean') {
    settings.autostart = obj.autostart;
  }
  if (typeof obj.evaluationsFilterByCourse === 'boolean') {
    settings.evaluationsFilterByCourse = obj.evaluationsFilterByCourse;
  }
  if (typeof obj.gradeShift === 'string' && obj.gradeShift.trim().length > 0) {
    settings.gradeShift = obj.gradeShift;
  }
  if (Array.isArray(obj.flowchartOpenSemesters)) {
    const nums = obj.flowchartOpenSemesters.filter(
      (n): n is number => typeof n === 'number' && Number.isFinite(n),
    );
    if (nums.length > 0) {
      settings.flowchartOpenSemesters = nums;
    }
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function countDistinctDisciplineEntries(map: DisciplineUserDataMap): number {
  return Object.keys(map).length;
}

function buildCategorySummaries(
  data: UserBackupData,
): Record<BackupCategoryKey, BackupCategorySummaryItem> {
  const curriculum = data.curriculum ?? null;
  const manualMarksCount = curriculum
    ? curriculum.manualCompletedCodes.length +
      curriculum.manualUncompletedCodes.length
    : 0;
  const hasAltMatrix = Boolean(
    curriculum?.userSelectedCurriculumId ||
      curriculum?.userSelectedCurriculumCode ||
      curriculum?.customCurriculum,
  );
  const curriculumParts: string[] = [];
  if (manualMarksCount > 0) {
    curriculumParts.push(
      `${manualMarksCount} ${manualMarksCount === 1 ? 'marcação manual' : 'marcações manuais'}`,
    );
  }
  if (hasAltMatrix) {
    curriculumParts.push('matriz alternativa');
  }

  const disciplineCount = data.disciplineGrades
    ? countDistinctDisciplineEntries(data.disciplineGrades)
    : 0;
  const eventsCount = data.calendarEvents?.length ?? 0;
  const gradesCount = data.savedGrades?.length ?? 0;
  const iraSemestersCount = data.iraScenario?.semesters.length ?? 0;
  const assocCount = data.courseAssociations?.length ?? 0;
  const feedStatesCount = data.feedStates?.length ?? 0;
  const settingsCount = data.settings ? Object.keys(data.settings).length : 0;

  return {
    curriculum: {
      key: 'curriculum',
      hasData: hasCurriculumOverrides(curriculum),
      count: manualMarksCount + (hasAltMatrix ? 1 : 0),
      detail: curriculumParts.join(' · ') || 'Sem alterações',
    },
    disciplineGrades: {
      key: 'disciplineGrades',
      hasData: disciplineCount > 0,
      count: disciplineCount,
      detail:
        disciplineCount > 0
          ? `${disciplineCount} ${disciplineCount === 1 ? 'registro salvo' : 'registros salvos'}`
          : 'Nenhum registro',
    },
    calendarEvents: {
      key: 'calendarEvents',
      hasData: eventsCount > 0,
      count: eventsCount,
      detail:
        eventsCount > 0
          ? `${eventsCount} ${eventsCount === 1 ? 'evento pessoal' : 'eventos pessoais'}`
          : 'Nenhum evento',
    },
    savedGrades: {
      key: 'savedGrades',
      hasData: gradesCount > 0,
      count: gradesCount,
      detail:
        gradesCount > 0
          ? `${gradesCount} ${gradesCount === 1 ? 'grade salva' : 'grades salvas'}`
          : 'Nenhuma grade',
    },
    iraScenario: {
      key: 'iraScenario',
      hasData: Boolean(data.iraScenario && iraSemestersCount > 0),
      count: iraSemestersCount,
      detail:
        iraSemestersCount > 0
          ? `${iraSemestersCount} ${iraSemestersCount === 1 ? 'semestre simulado' : 'semestres simulados'}`
          : 'Sem simulação',
    },
    courseAssociations: {
      key: 'courseAssociations',
      hasData: assocCount > 0,
      count: assocCount,
      detail:
        assocCount > 0
          ? `${assocCount} ${assocCount === 1 ? 'vínculo de turma' : 'vínculos de turmas'}`
          : 'Nenhum vínculo',
    },
    feedStates: {
      key: 'feedStates',
      hasData: feedStatesCount > 0,
      count: feedStatesCount,
      detail:
        feedStatesCount > 0
          ? `${feedStatesCount} ${feedStatesCount === 1 ? 'tarefa marcada' : 'tarefas marcadas'}`
          : 'Nenhuma tarefa',
    },
    settings: {
      key: 'settings',
      hasData: settingsCount > 0,
      count: settingsCount,
      detail:
        settingsCount > 0
          ? `${settingsCount} ${settingsCount === 1 ? 'preferência' : 'preferências'}`
          : 'Sem preferências',
    },
  };
}

/**
 * Valida e sanitiza o conteúdo de um arquivo JSON de backup do Saruê UnB.
 * Lança erro com mensagem amigável em pt-BR caso o arquivo seja inválido.
 */
export function parseUserBackupJson(rawText: string): ParsedUserBackup {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('O arquivo selecionado está vazio.');
  }

  const byteLength = new TextEncoder().encode(rawText).byteLength;
  if (byteLength > BACKUP_MAX_FILE_BYTES) {
    throw new Error('O arquivo excede o limite máximo permitido de 10 MB.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Arquivo inválido: não é um JSON válido.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Estrutura de backup inválida.');
  }

  const root = parsed as Record<string, unknown>;
  if (root.app !== BACKUP_APP_ID) {
    throw new Error('Este arquivo não é um backup do Saruê UnB.');
  }

  const schemaVersion = Number(root.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error('Versão do formato de backup inválida.');
  }
  if (schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Este backup foi criado por uma versão mais recente do Saruê UnB (schema v${schemaVersion}). Atualize o aplicativo antes de importar.`,
    );
  }

  if (!root.data || typeof root.data !== 'object' || Array.isArray(root.data)) {
    throw new Error('O arquivo de backup não contém o bloco de dados.');
  }

  const rawData = root.data as Record<string, unknown>;
  const curriculum = sanitizeCurriculum(rawData.curriculum);
  const disciplineGrades = sanitizeDisciplineUserDataMap(
    rawData.disciplineGrades,
  );
  const calendarEvents = sanitizeCalendarEvents(rawData.calendarEvents);
  const savedGrades = sanitizeSavedGrades(rawData.savedGrades);
  const iraScenario = rawData.iraScenario
    ? parseIraScenarioJson(JSON.stringify(rawData.iraScenario))
    : null;
  const courseAssociations = sanitizeCourseAssociations(
    rawData.courseAssociations,
  );
  const feedStates = sanitizeFeedStates(rawData.feedStates);
  const settings = sanitizeSettings(rawData.settings);

  const data: UserBackupData = {
    ...(curriculum ? { curriculum } : {}),
    ...(Object.keys(disciplineGrades).length > 0 ? { disciplineGrades } : {}),
    ...(calendarEvents.length > 0 ? { calendarEvents } : {}),
    ...(savedGrades.length > 0 ? { savedGrades } : {}),
    ...(iraScenario ? { iraScenario } : {}),
    ...(courseAssociations.length > 0 ? { courseAssociations } : {}),
    ...(feedStates.length > 0 ? { feedStates } : {}),
    ...(settings ? { settings } : {}),
  };

  const payload: UserBackupPayload = {
    app: BACKUP_APP_ID,
    schemaVersion,
    appVersion: asOptionalString(root.appVersion) ?? 'desconhecida',
    exportedAt: asOptionalString(root.exportedAt) ?? new Date().toISOString(),
    data,
  };

  const categories = buildCategorySummaries(data);
  const availableCategories = BACKUP_CATEGORY_ORDER.filter(
    (key) => categories[key].hasData,
  );

  if (availableCategories.length === 0) {
    throw new Error('Este arquivo de backup não possui dados para restaurar.');
  }

  return {
    payload,
    categories,
    availableCategories,
  };
}

/**
 * Restaura as categorias selecionadas do backup no SQLite e `localStorage`.
 * Sempre preserva matrícula, CPF e histórico oficial vindo do SIGAA.
 */
export async function applyUserBackup(
  parsed: ParsedUserBackup,
  options: UserBackupImportOptions,
  deps: Omit<BackupServiceDeps, 'appVersion'>,
): Promise<UserBackupImportResult> {
  const selected = new Set(options.categories);
  const { mode } = options;
  const { data } = parsed.payload;
  const restoredCategories: BackupCategoryKey[] = [];
  const db = await getDatabase();

  // 1. Currículo e Fluxograma (overrides manuais)
  if (selected.has('curriculum') && data.curriculum) {
    const incoming = data.curriculum;
    const existing = await deps.repos.academicProfileRepo.getProfile();
    const nowIso = new Date().toISOString();

    const baseProfile: StudentAcademicProfile = existing ?? {
      matricula: 'local-backup',
      courseName: incoming.userSelectedCourseName ?? 'Curso selecionado',
      level: 'GRADUAÇÃO',
      admissionYear: '',
      completedDisciplines: [],
      manualCompletedCodes: [],
      manualUncompletedCodes: [],
      updatedAt: nowIso,
    };

    const nextManualCompleted =
      mode === 'replace'
        ? [...incoming.manualCompletedCodes]
        : Array.from(
            new Set([
              ...(baseProfile.manualCompletedCodes ?? []),
              ...incoming.manualCompletedCodes,
            ]),
          );

    const nextManualUncompleted =
      mode === 'replace'
        ? [...incoming.manualUncompletedCodes]
        : Array.from(
            new Set([
              ...(baseProfile.manualUncompletedCodes ?? []),
              ...incoming.manualUncompletedCodes,
            ]),
          );

    const updatedProfile: StudentAcademicProfile = {
      ...baseProfile,
      userSelectedCourseName:
        mode === 'replace'
          ? incoming.userSelectedCourseName
          : incoming.userSelectedCourseName ??
            baseProfile.userSelectedCourseName,
      userSelectedCurriculumId:
        mode === 'replace'
          ? incoming.userSelectedCurriculumId
          : incoming.userSelectedCurriculumId ??
            baseProfile.userSelectedCurriculumId,
      userSelectedCurriculumCode:
        mode === 'replace'
          ? incoming.userSelectedCurriculumCode
          : incoming.userSelectedCurriculumCode ??
            baseProfile.userSelectedCurriculumCode,
      customCurriculum:
        mode === 'replace'
          ? incoming.customCurriculum
          : incoming.customCurriculum ?? baseProfile.customCurriculum,
      manualCompletedCodes: nextManualCompleted,
      manualUncompletedCodes: nextManualUncompleted,
      updatedAt: nowIso,
    };

    await deps.repos.academicProfileRepo.saveProfile(updatedProfile);
    restoredCategories.push('curriculum');
  }

  // 2. Notas e Faltas manuais
  if (selected.has('disciplineGrades') && data.disciplineGrades) {
    await importDisciplineUserData(data.disciplineGrades, mode);
    restoredCategories.push('disciplineGrades');
  }

  // 3. Eventos pessoais do Calendário
  if (selected.has('calendarEvents') && data.calendarEvents) {
    if (mode === 'replace') {
      const existingEvents = await deps.repos.userEventsRepo.getEvents();
      for (const ev of existingEvents) {
        await deps.repos.userEventsRepo.deleteEvent(ev.id);
      }
    }
    for (const ev of data.calendarEvents) {
      await deps.repos.userEventsRepo.saveEvent(ev);
    }
    restoredCategories.push('calendarEvents');
  }

  // 4. Grades horárias salvas
  if (selected.has('savedGrades') && data.savedGrades) {
    if (mode === 'replace') {
      await deps.repos.gradeRepo.clearSavedGrade();
    }
    for (const grade of data.savedGrades) {
      await deps.repos.gradeRepo.saveGrade(grade);
    }
    restoredCategories.push('savedGrades');
  }

  // 5. Simulador de IRA
  if (selected.has('iraScenario') && data.iraScenario) {
    await deps.repos.iraScenarioRepo.saveScenario(data.iraScenario);
    restoredCategories.push('iraScenario');
  }

  // 6. Vínculos manuais de turmas (Aprender 3 <-> SIGAA)
  if (selected.has('courseAssociations') && data.courseAssociations) {
    if (mode === 'replace' && db) {
      try {
        await db.execute('DELETE FROM course_associations;');
      } catch (e) {
        console.warn('[user-backup] Falha ao limpar course_associations:', e);
      }
    }
    for (const assoc of data.courseAssociations) {
      await deps.repos.feedRepo.saveAssociation({
        aprenderCourseId: assoc.aprenderCourseId,
        sigaaCourseId: assoc.sigaaCourseId ?? null,
        isIgnored: assoc.isIgnored,
      });
    }
    restoredCategories.push('courseAssociations');
  }

  // 7. Estado manual de tarefas do Feed (concluídas / arquivadas)
  if (selected.has('feedStates') && data.feedStates) {
    if (mode === 'replace') {
      if (db) {
        try {
          await db.execute(
            'UPDATE feed_items SET is_completed = 0, is_hidden = 0;',
          );
        } catch (e) {
          console.warn('[user-backup] Falha ao resetar estados do feed:', e);
        }
      } else {
        const existingItems = await deps.repos.feedRepo.getItems({
          includeArchived: true,
        });
        for (const item of existingItems) {
          if (item.isCompleted) {
            await deps.repos.feedRepo.markItemAsCompleted(item.id, false);
          }
          if (item.isArchived) {
            await deps.repos.feedRepo.archiveItem(item.id, false);
          }
        }
      }
    }
    for (const state of data.feedStates) {
      await deps.repos.feedRepo.markItemAsCompleted(state.id, state.isCompleted);
      await deps.repos.feedRepo.archiveItem(state.id, state.isArchived);
    }
    restoredCategories.push('feedStates');
  }

  // 8. Preferências e Notificações
  let appliedSettings: UserBackupSettings | undefined;
  if (selected.has('settings') && data.settings) {
    const s = data.settings;
    appliedSettings = s;

    if (s.theme) {
      setThemeModePersistence(s.theme);
      applyTheme(s.theme);
    }
    if (typeof s.uiZoom === 'number') {
      applyUiZoom(s.uiZoom);
    }
    if (typeof s.reduceAnimations === 'boolean') {
      setReducedMotionPreference(s.reduceAnimations);
    }
    if (typeof s.hideRuDesktopSidebar === 'boolean') {
      setRuHiddenInDesktopSidebar(s.hideRuDesktopSidebar);
    }
    if (typeof s.soundEffects === 'boolean') {
      setSoundEffectsEnabled(s.soundEffects);
    }

    if (typeof window !== 'undefined') {
      try {
        if (typeof s.ruCampus === 'string') {
          window.localStorage.setItem(CAMPUS_STORAGE_KEY, s.ruCampus);
        }
        if (typeof s.evaluationsFilterByCourse === 'boolean') {
          window.localStorage.setItem(
            STORAGE_KEYS.EVALUATIONS_FILTER_BY_COURSE,
            String(s.evaluationsFilterByCourse),
          );
        }
        if (typeof s.gradeShift === 'string') {
          window.localStorage.setItem(GRADE_SHIFT_STORAGE_KEY, s.gradeShift);
        }
        if (Array.isArray(s.flowchartOpenSemesters)) {
          window.localStorage.setItem(
            STORAGE_KEYS.FLOWCHART_OPEN_SEMESTERS,
            JSON.stringify(s.flowchartOpenSemesters),
          );
        }
      } catch {
        // Ignora erro de localStorage indisponível
      }
    }

    if (s.notificationSettings) {
      await saveNotificationSettings(s.notificationSettings);
      void syncRuMenuNotifications({ fetchIfMissing: false });
    }

    restoredCategories.push('settings');
  }

  return {
    restoredCategories,
    appliedSettings,
  };
}

/**
 * Exporta o payload do backup para um arquivo `.json`:
 * - No Android (Tauri), abre a folha nativa de compartilhamento via `shareTextFile`.
 * - No Desktop/Web, dispara o download direto via Blob + `<a download>`.
 */
export async function downloadOrShareBackupFile(
  payload: UserBackupPayload,
): Promise<{
  filename: string;
  method: 'share' | 'save' | 'download' | 'cancelled';
  path?: string;
}> {
  const datePart = payload.exportedAt.slice(0, 10);
  const filename = `sarue-backup-${datePart}.json`;
  const json = JSON.stringify(payload, null, 2);

  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { commands } = await import('./bindings');
    const res = await commands.shareTextFile(
      json,
      filename,
      'application/json',
      'Salvar Backup do Saruê UnB',
    );
    if (res.status === 'error') {
      throw new Error(res.error);
    }
    if (res.data.outcome === 'cancelled') {
      return { filename, method: 'cancelled' };
    }
    if (res.data.outcome === 'shared') {
      return { filename, method: 'share' };
    }
    return {
      filename,
      method: 'save',
      path: res.data.path ?? undefined,
    };
  }

  if (
    isMobileDevice() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    const file = new File([json], filename, { type: 'application/json' });
    if (
      typeof navigator.canShare !== 'function' ||
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: 'Backup Saruê UnB' });
      return { filename, method: 'share' };
    }
  }

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename, method: 'download' };
}

/**
 * Apaga todos os dados locais manuais do usuário (notas/faltas, eventos do calendário,
 * `app_settings` e chaves auxiliares no `localStorage`). Usado na Zona de Perigo.
 */
export async function clearAllLocalUserData(
  repos: Pick<Repositories, 'userEventsRepo'>,
): Promise<void> {
  await clearAllDisciplineUserData();

  const existingEvents = await repos.userEventsRepo.getEvents();
  for (const ev of existingEvents) {
    await repos.userEventsRepo.deleteEvent(ev.id);
  }

  const db = await getDatabase();
  if (db) {
    try {
      await db.execute('DELETE FROM user_calendar_events;');
    } catch (e) {
      console.warn('[user-backup] Falha ao limpar user_calendar_events:', e);
    }
    try {
      await db.execute('DELETE FROM app_settings;');
    } catch (e) {
      console.warn('[user-backup] Falha ao limpar app_settings:', e);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('sarue_user_calendar_events');
      window.localStorage.removeItem(CAMPUS_STORAGE_KEY);
      window.localStorage.removeItem(GRADE_SHIFT_STORAGE_KEY);
    } catch {}
  }
}
