import type { CurriculumStructure } from './course';
import type { SavedGrade } from './grade';
import type { IraScenario } from './ira-scenario';
import type { NotificationSettings } from './notification-settings';
import type { UserCalendarEvent } from './user-calendar-event';

export type BackupThemeMode = 'light' | 'dark' | 'system';
export type BackupUiZoom = 0.9 | 0.95 | 1 | 1.05 | 1.1 | 1.15 | 1.2;

export interface BackupDisciplineUserDataEntry {
  formula?: string;
  values?: Record<string, number | null>;
  absenceOverride?: number | null;
  updatedAt: string;
}

export type BackupDisciplineUserDataMap = Record<
  string,
  BackupDisciplineUserDataEntry
>;

export const BACKUP_APP_ID = 'sarue-unb' as const;
export const BACKUP_SCHEMA_VERSION = 1 as const;
export const BACKUP_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export type BackupCategoryKey =
  | 'curriculum'
  | 'disciplineGrades'
  | 'calendarEvents'
  | 'savedGrades'
  | 'iraScenario'
  | 'courseAssociations'
  | 'feedStates'
  | 'settings';

export const BACKUP_CATEGORY_ORDER: readonly BackupCategoryKey[] = [
  'curriculum',
  'disciplineGrades',
  'calendarEvents',
  'savedGrades',
  'iraScenario',
  'courseAssociations',
  'feedStates',
  'settings',
] as const;

export type BackupImportMode = 'merge' | 'replace';

export interface UserBackupCurriculumOverrides {
  userSelectedCourseName?: string;
  userSelectedCurriculumId?: string;
  userSelectedCurriculumCode?: string;
  customCurriculum?: CurriculumStructure;
  manualCompletedCodes: string[];
  manualUncompletedCodes: string[];
}

export interface UserBackupCourseAssociation {
  aprenderCourseId: string;
  sigaaCourseId?: string;
  isIgnored: boolean;
}

export interface UserBackupFeedItemState {
  id: string;
  isCompleted: boolean;
  isArchived: boolean;
}

export interface UserBackupSettings {
  theme?: BackupThemeMode;
  uiZoom?: BackupUiZoom;
  reduceAnimations?: boolean;
  soundEffects?: boolean;
  hideRuDesktopSidebar?: boolean;
  ruCampus?: string;
  notificationSettings?: NotificationSettings;
  syncOnlyOnWifi?: boolean;
  backgroundRun?: boolean;
  autostart?: boolean;
  evaluationsFilterByCourse?: boolean;
  gradeShift?: string;
  flowchartOpenSemesters?: number[];
}

export interface UserBackupData {
  curriculum?: UserBackupCurriculumOverrides | null;
  disciplineGrades?: BackupDisciplineUserDataMap;
  calendarEvents?: UserCalendarEvent[];
  savedGrades?: SavedGrade[];
  iraScenario?: IraScenario | null;
  courseAssociations?: UserBackupCourseAssociation[];
  feedStates?: UserBackupFeedItemState[];
  settings?: UserBackupSettings;
}

export interface UserBackupPayload {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: UserBackupData;
}

export interface BackupCategorySummaryItem {
  key: BackupCategoryKey;
  hasData: boolean;
  count: number;
  detail: string;
}

export interface ParsedUserBackup {
  payload: UserBackupPayload;
  categories: Record<BackupCategoryKey, BackupCategorySummaryItem>;
  availableCategories: BackupCategoryKey[];
}

export interface UserBackupImportOptions {
  mode: BackupImportMode;
  categories: BackupCategoryKey[];
}

export interface UserBackupImportResult {
  restoredCategories: BackupCategoryKey[];
  appliedSettings?: UserBackupSettings;
}
