import { STORAGE_KEYS } from '@/lib/storage-keys';
import type { Discipline } from '../domain/entities/course';
import { getDatabase } from './sqlite-feed.repo';

export const DISCIPLINE_USER_DATA_SQLITE_KEY = 'discipline_user_data';
export const DEFAULT_GRADE_FORMULA = '(P1 + P2) / 2';

export interface DisciplineUserDataEntry {
  formula?: string;
  values?: Record<string, number | null>;
  absenceOverride?: number | null;
  updatedAt: string;
}

export type DisciplineUserDataMap = Record<string, DisciplineUserDataEntry>;

const listeners = new Set<() => void>();
let inMemoryMap: DisciplineUserDataMap | null = null;
let hydratedFromSqlite = false;
let loadPromise: Promise<DisciplineUserDataMap> | null = null;

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeToDisciplineUserData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isDisciplineUserDataHydrated(): boolean {
  return hydratedFromSqlite;
}

/**
 * Gera a lista ordenada de chaves candidatas para localizar dados de uma disciplina,
 * permitindo recuperar notas e faltas mesmo se o `discipline.id` mudar entre
 * sincronizações (ex.: `aprender-123` → `sigaa-456`).
 */
export function resolveDisciplineStorageKeys(
  discipline: Discipline | string,
): string[] {
  if (typeof discipline === 'string') {
    return discipline ? [discipline] : [];
  }

  const keys: string[] = [];
  const pushUnique = (key?: string | null) => {
    const trimmed = key?.trim();
    if (trimmed && !keys.includes(trimmed)) {
      keys.push(trimmed);
    }
  };

  pushUnique(discipline.id);
  pushUnique(discipline.sigaaCourse?.id);
  for (const c of discipline.aprenderCourses ?? []) {
    pushUnique(c.id);
  }
  for (const c of discipline.teamsCourses ?? []) {
    pushUnique(c.id);
  }

  const normalizedCode = discipline.code?.trim().toUpperCase();
  const normalizedSemester = discipline.semester?.trim();
  if (normalizedCode && normalizedSemester) {
    pushUnique(`code:${normalizedCode}:${normalizedSemester}`);
  } else if (normalizedCode) {
    pushUnique(`code:${normalizedCode}`);
  }

  return keys;
}

function hasGradeValues(values?: Record<string, number | null>): boolean {
  if (!values || typeof values !== 'object') return false;
  return Object.values(values).some((v) => v !== null && v !== undefined);
}

function hasCustomFormula(formula?: string): boolean {
  return Boolean(formula && formula.trim() && formula !== DEFAULT_GRADE_FORMULA);
}

function entryHasMeaningfulGrades(entry?: DisciplineUserDataEntry): boolean {
  if (!entry) return false;
  return hasGradeValues(entry.values) || hasCustomFormula(entry.formula);
}

function sanitizeValues(raw: unknown): Record<string, number | null> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null) {
      result[k] = null;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      result[k] = v;
    }
  }
  return result;
}

function sanitizeAbsenceOverride(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function sanitizeEntry(raw: unknown): DisciplineUserDataEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const formula = typeof obj.formula === 'string' ? obj.formula : undefined;
  const values = sanitizeValues(obj.values);
  const absenceOverride = sanitizeAbsenceOverride(obj.absenceOverride);
  const updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt : '';
  if (formula === undefined && values === undefined && absenceOverride === undefined) {
    return null;
  }
  return { formula, values, absenceOverride, updatedAt };
}

function mergeEntries(
  base: DisciplineUserDataEntry | undefined,
  incoming: DisciplineUserDataEntry | undefined,
): DisciplineUserDataEntry | undefined {
  if (!base) return incoming ? { ...incoming } : undefined;
  if (!incoming) return { ...base };

  const baseHasTime = Boolean(base.updatedAt);
  const incomingHasTime = Boolean(incoming.updatedAt);
  const preferIncoming =
    incomingHasTime && (!baseHasTime || incoming.updatedAt >= base.updatedAt);

  const primary = preferIncoming ? incoming : base;
  const secondary = preferIncoming ? base : incoming;

  // Não deixa um rascunho vazio sobrescrever notas já registradas
  const useSecondaryGrades =
    !entryHasMeaningfulGrades(primary) && entryHasMeaningfulGrades(secondary);

  const formula = useSecondaryGrades
    ? secondary.formula ?? primary.formula
    : primary.formula ?? secondary.formula;
  const values = useSecondaryGrades
    ? secondary.values ?? primary.values
    : primary.values ?? secondary.values;

  const absenceOverride =
    primary.absenceOverride !== undefined
      ? primary.absenceOverride
      : secondary.absenceOverride;

  const updatedAt =
    primary.updatedAt && secondary.updatedAt
      ? primary.updatedAt >= secondary.updatedAt
        ? primary.updatedAt
        : secondary.updatedAt
      : primary.updatedAt || secondary.updatedAt;

  return { formula, values, absenceOverride, updatedAt };
}

function mergeMaps(
  base: DisciplineUserDataMap,
  incoming: DisciplineUserDataMap,
): DisciplineUserDataMap {
  const merged: DisciplineUserDataMap = {};
  const allKeys = new Set([...Object.keys(base), ...Object.keys(incoming)]);
  for (const key of allKeys) {
    const entry = mergeEntries(base[key], incoming[key]);
    if (entry) merged[key] = entry;
  }
  return merged;
}

function readLegacyLocalStorageEntries(): DisciplineUserDataMap {
  if (typeof window === 'undefined') return {};
  const map: DisciplineUserDataMap = {};
  try {
    const storage = window.localStorage;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;

      const gradeMatch = key.match(
        /^sarue:discipline_grades:(.+):(formula|values)$/,
      );
      if (gradeMatch) {
        const [, id, field] = gradeMatch;
        const raw = storage.getItem(key);
        if (raw === null) continue;
        const current = map[id] ?? { updatedAt: '' };
        if (field === 'formula') {
          current.formula = raw;
        } else if (field === 'values') {
          try {
            current.values = sanitizeValues(JSON.parse(raw));
          } catch {}
        }
        map[id] = current;
        continue;
      }

      const absenceMatch = key.match(/^sarue:discipline_absences:(.+):override$/);
      if (absenceMatch) {
        const [, id] = absenceMatch;
        const raw = storage.getItem(key);
        if (raw === null) continue;
        const parsed = sanitizeAbsenceOverride(raw);
        if (parsed !== undefined) {
          const current = map[id] ?? { updatedAt: '' };
          current.absenceOverride = parsed;
          map[id] = current;
        }
      }
    }
  } catch {
    // localStorage indisponível
  }
  return map;
}

function readV2LocalStorageMap(): DisciplineUserDataMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.DISCIPLINE_GRADES);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const map: DisciplineUserDataMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      const entry = sanitizeEntry(v);
      if (entry) map[k] = entry;
    }
    return map;
  } catch {
    return {};
  }
}

function ensureInMemoryMap(): DisciplineUserDataMap {
  if (inMemoryMap) return inMemoryMap;
  const legacy = readLegacyLocalStorageEntries();
  const v2 = readV2LocalStorageMap();
  inMemoryMap = mergeMaps(legacy, v2);
  return inMemoryMap;
}

function writeLocalStorageMirror(map: DisciplineUserDataMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.DISCIPLINE_GRADES,
      JSON.stringify(map),
    );
  } catch {}
}

async function persistMapToSqlite(map: DisciplineUserDataMap): Promise<void> {
  try {
    const db = await getDatabase();
    if (!db) return;
    await db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3);',
      [
        DISCIPLINE_USER_DATA_SQLITE_KEY,
        JSON.stringify(map),
        new Date().toISOString(),
      ],
    );
  } catch (err) {
    console.warn(
      '[discipline-grades] Falha ao persistir notas/faltas no SQLite:',
      err,
    );
  }
}

/**
 * Carrega notas e ajustes de faltas do SQLite (`app_settings`), mesclando de forma
 * não-destrutiva com chaves legadas/v2 do `localStorage` e migrando para o SQLite.
 */
export async function loadDisciplineUserData(): Promise<DisciplineUserDataMap> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const localMap = ensureInMemoryMap();
    const sqliteMap: DisciplineUserDataMap = {};
    let hadSqliteRow = false;

    try {
      const db = await getDatabase();
      if (db) {
        const rows = await db.select<Array<{ value: string }>>(
          'SELECT value FROM app_settings WHERE key = $1 LIMIT 1;',
          [DISCIPLINE_USER_DATA_SQLITE_KEY],
        );
        if (rows && rows.length > 0 && rows[0].value) {
          hadSqliteRow = true;
          const parsed = JSON.parse(rows[0].value) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              const entry = sanitizeEntry(v);
              if (entry) sqliteMap[k] = entry;
            }
          }
        }
      }
    } catch (err) {
      console.warn(
        '[discipline-grades] Falha ao ler app_settings do SQLite:',
        err,
      );
    }

    const merged = mergeMaps(localMap, sqliteMap);
    inMemoryMap = merged;
    hydratedFromSqlite = true;
    writeLocalStorageMirror(merged);

    // Se havia dados locais ainda não salvos no SQLite (ex.: migração após update), persiste agora
    const mergedSerialized = JSON.stringify(merged);
    if (
      Object.keys(merged).length > 0 &&
      (!hadSqliteRow || mergedSerialized !== JSON.stringify(sqliteMap))
    ) {
      await persistMapToSqlite(merged);
    }

    notifyListeners();
    return merged;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

function findEntryForDiscipline(
  map: DisciplineUserDataMap,
  discipline: Discipline | string,
  predicate?: (entry: DisciplineUserDataEntry) => boolean,
): { key: string; entry: DisciplineUserDataEntry } | null {
  const candidateKeys = resolveDisciplineStorageKeys(discipline);
  for (const key of candidateKeys) {
    const entry = map[key];
    if (entry && (!predicate || predicate(entry))) {
      return { key, entry };
    }
  }
  return null;
}

export function getDisciplineGradeData(discipline: Discipline | string): {
  formula: string;
  values: Record<string, number | null>;
  found: boolean;
} {
  const map = ensureInMemoryMap();
  const matched =
    findEntryForDiscipline(map, discipline, entryHasMeaningfulGrades) ??
    findEntryForDiscipline(
      map,
      discipline,
      (e) => e.formula !== undefined || e.values !== undefined,
    );

  if (!matched) {
    return {
      formula: DEFAULT_GRADE_FORMULA,
      values: {},
      found: false,
    };
  }

  return {
    formula: matched.entry.formula || DEFAULT_GRADE_FORMULA,
    values: matched.entry.values ? { ...matched.entry.values } : {},
    found: true,
  };
}

export async function saveDisciplineGradeData(
  discipline: Discipline | string,
  data: { formula: string; values: Record<string, number | null> },
): Promise<void> {
  const map = ensureInMemoryMap();
  const primaryKey = typeof discipline === 'string' ? discipline : discipline.id;
  if (!primaryKey) return;

  const existing = map[primaryKey];
  const nowIso = new Date().toISOString();
  const updated: DisciplineUserDataEntry = {
    ...existing,
    formula: data.formula,
    values: { ...data.values },
    updatedAt: nowIso,
  };

  map[primaryKey] = updated;

  // Também espelha em chave por código+semestre quando disponível, garantindo recuperação
  // caso o `discipline.id` mude entre Aprender 3 e SIGAA em uma atualização futura.
  if (typeof discipline !== 'string') {
    const normalizedCode = discipline.code?.trim().toUpperCase();
    const normalizedSemester = discipline.semester?.trim();
    if (normalizedCode && normalizedSemester) {
      map[`code:${normalizedCode}:${normalizedSemester}`] = updated;
    }
  }

  writeLocalStorageMirror(map);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        `sarue:discipline_grades:${primaryKey}:formula`,
        data.formula,
      );
      window.localStorage.setItem(
        `sarue:discipline_grades:${primaryKey}:values`,
        JSON.stringify(data.values),
      );
    } catch {}
  }

  await persistMapToSqlite(map);
}

export function getDisciplineAbsenceOverride(
  discipline: Discipline | string,
): number | null {
  const map = ensureInMemoryMap();
  const matched = findEntryForDiscipline(
    map,
    discipline,
    (e) => e.absenceOverride !== undefined && e.absenceOverride !== null,
  );
  if (!matched || matched.entry.absenceOverride === undefined) return null;
  return matched.entry.absenceOverride;
}

export function saveDisciplineAbsenceOverride(
  discipline: Discipline | string,
  value: number | null,
): void {
  const map = ensureInMemoryMap();
  const primaryKey = typeof discipline === 'string' ? discipline : discipline.id;
  if (!primaryKey) return;

  const normalized =
    value !== null && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : null;

  const nowIso = new Date().toISOString();
  const updated: DisciplineUserDataEntry = {
    ...map[primaryKey],
    absenceOverride: normalized,
    updatedAt: nowIso,
  };
  map[primaryKey] = updated;

  // Atualiza também chaves secundárias que eventualmente tinham override antigo
  for (const key of resolveDisciplineStorageKeys(discipline)) {
    if (key !== primaryKey && map[key]) {
      map[key] = {
        ...map[key],
        absenceOverride: normalized,
        updatedAt: nowIso,
      };
    }
  }
  if (typeof discipline !== 'string') {
    const normalizedCode = discipline.code?.trim().toUpperCase();
    const normalizedSemester = discipline.semester?.trim();
    if (normalizedCode && normalizedSemester) {
      map[`code:${normalizedCode}:${normalizedSemester}`] = {
        ...map[`code:${normalizedCode}:${normalizedSemester}`],
        absenceOverride: normalized,
        updatedAt: nowIso,
      };
    }
  }

  writeLocalStorageMirror(map);
  if (typeof window !== 'undefined') {
    try {
      const legacyKey = `sarue:discipline_absences:${primaryKey}:override`;
      if (normalized === null) {
        window.localStorage.removeItem(legacyKey);
      } else {
        window.localStorage.setItem(legacyKey, String(normalized));
      }
    } catch {}
  }

  void persistMapToSqlite(map);
}

/** Sanitiza um mapa externo (ex.: importação de backup) removendo entradas inválidas. */
export function sanitizeDisciplineUserDataMap(raw: unknown): DisciplineUserDataMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: DisciplineUserDataMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    const entry = sanitizeEntry(val);
    if (entry) result[trimmedKey] = entry;
  }
  return result;
}

/** Exporta uma cópia limpa de todas as notas e faltas manuais persistidas. */
export async function exportAllDisciplineUserData(): Promise<DisciplineUserDataMap> {
  const map = await loadDisciplineUserData();
  const snapshot: DisciplineUserDataMap = {};
  for (const [key, entry] of Object.entries(map)) {
    snapshot[key] = {
      ...(entry.formula !== undefined ? { formula: entry.formula } : {}),
      ...(entry.values !== undefined ? { values: { ...entry.values } } : {}),
      ...(entry.absenceOverride !== undefined
        ? { absenceOverride: entry.absenceOverride }
        : {}),
      updatedAt: entry.updatedAt,
    };
  }
  return snapshot;
}

/** Importa notas e faltas manuais em modo `merge` (padrão) ou `replace`. */
export async function importDisciplineUserData(
  incoming: DisciplineUserDataMap,
  mode: 'merge' | 'replace',
): Promise<number> {
  const sanitized = sanitizeDisciplineUserDataMap(incoming);
  const current = await loadDisciplineUserData();
  const next = mode === 'replace' ? sanitized : mergeMaps(current, sanitized);

  inMemoryMap = next;
  hydratedFromSqlite = true;
  writeLocalStorageMirror(next);
  await persistMapToSqlite(next);
  notifyListeners();

  return Object.keys(sanitized).length;
}

/** Apaga completamente todas as notas e faltas manuais (memória, localStorage v2/legado e SQLite). */
export async function clearAllDisciplineUserData(): Promise<void> {
  inMemoryMap = {};
  hydratedFromSqlite = true;
  loadPromise = null;

  if (typeof window !== 'undefined') {
    try {
      const storage = window.localStorage;
      const toRemove: string[] = [STORAGE_KEYS.DISCIPLINE_GRADES];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (
          key &&
          (key.startsWith('sarue:discipline_grades:') ||
            key.startsWith('sarue:discipline_absences:'))
        ) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((k) => storage.removeItem(k));
    } catch {}
  }

  try {
    const db = await getDatabase();
    if (db) {
      await db.execute('DELETE FROM app_settings WHERE key = $1;', [
        DISCIPLINE_USER_DATA_SQLITE_KEY,
      ]);
    }
  } catch (err) {
    console.warn('[discipline-grades] Falha ao limpar app_settings:', err);
  }

  notifyListeners();
}

/** Apenas para testes unitários: limpa o estado em memória do módulo. */
export function resetDisciplineUserDataCacheForTests(): void {
  inMemoryMap = null;
  hydratedFromSqlite = false;
  loadPromise = null;
  listeners.clear();
}
