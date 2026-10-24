import type {
  Department,
  ScrapedDiscipline,
  ScrapedProfessor,
} from './grade';

export const PROFESSOR_EVALUATIONS_SHEET_ID =
  '1RK3N-2DtuKShO_2fpd5Cag_GsHYNIARD8WHLpCLTdCk';
export const PROFESSOR_EVALUATIONS_SHEET_GID = '1411813915';

export const PROFESSOR_EVALUATIONS_SHEET_URL = `https://docs.google.com/spreadsheets/d/${PROFESSOR_EVALUATIONS_SHEET_ID}/edit?gid=${PROFESSOR_EVALUATIONS_SHEET_GID}#gid=${PROFESSOR_EVALUATIONS_SHEET_GID}`;

export const PROFESSOR_EVALUATIONS_CSV_URL = `https://docs.google.com/spreadsheets/d/${PROFESSOR_EVALUATIONS_SHEET_ID}/export?format=csv&gid=${PROFESSOR_EVALUATIONS_SHEET_GID}`;

export type CampusName =
  | 'Darcy Ribeiro'
  | 'Ceilândia'
  | 'Gama'
  | 'Planaltina'
  | 'Outro';

export type DifficultyLevel =
  | 'muito_facil'
  | 'facil'
  | 'medio'
  | 'dificil'
  | 'muito_dificil'
  | 'nivel_god';

export type WorkloadLevel =
  | 'muito_leve'
  | 'leve'
  | 'moderada'
  | 'intensa'
  | 'exagerada';

export type RecommendationType = 'sim' | 'depende' | 'nao';

export type AttendanceStrictness = 'tranquilo' | 'rigoroso' | 'nao_informado';

export interface ProfessorEvaluation {
  id: string;
  timestamp: string;
  createdAtIso: string;
  campus: CampusName;
  campusRaw: string;
  discipline: string;
  disciplineRaw?: string;
  disciplineCode?: string;
  modality: string;
  semester: string;
  department: string;
  professor: string;
  professorRaw?: string;
  siape?: string;
  photoUrl?: string;
  publicUrl?: string;
  isSigaaVerified?: boolean;
  didaticaScore: number | null;
  didaticaRaw: string;
  difficulty: string;
  difficultyLevel?: DifficultyLevel;
  workload: string;
  workloadLevel?: WorkloadLevel;
  material: string;
  recommendation: RecommendationType;
  recommendationRaw: string;
  feedback: string;
  evaluationMethods: string;
  hasMonitor: string;
  attendance: string;
  attendanceStrictness: AttendanceStrictness;
  outcome: string;
  caresAboutStudents: string;
  learnedContent: string;
}

export interface ProfessorSummary {
  professorKey: string;
  professorName: string;
  siape?: string;
  photoUrl?: string;
  publicUrl?: string;
  isSigaaVerified?: boolean;
  evaluationsCount: number;
  averageDidatica: number | null;
  recommendYesCount: number;
  recommendDependeCount: number;
  recommendNoCount: number;
  recommendationRate: number;
  hasConsistentLevels?: boolean;
  campuses: CampusName[];
  departments: string[];
  disciplines: string[];
  evaluations: ProfessorEvaluation[];
}

export interface DisciplineSummary {
  disciplineKey: string;
  disciplineName: string;
  disciplineCode?: string;
  isSigaaVerified?: boolean;
  evaluationsCount: number;
  professorsCount: number;
  averageDidatica: number | null;
  recommendYesCount: number;
  recommendDependeCount: number;
  recommendNoCount: number;
  recommendationRate: number;
  hasConsistentLevels?: boolean;
  campuses: CampusName[];
  departments: string[];
  professors: string[];
  evaluations: ProfessorEvaluation[];
}

export type ProfessorEvaluationSortBy =
  | 'rating_desc'
  | 'rating_asc'
  | 'reviews_desc'
  | 'recommendation_desc';

export interface ProfessorEvaluationFilters {
  query?: string;
  campus?: CampusName | 'all';
  recommendation?: RecommendationType | 'all';
  difficulty?: DifficultyLevel | 'all';
  attendance?: AttendanceStrictness | 'all';
  sortBy?: ProfessorEvaluationSortBy;
}

const STOPWORDS = new Set([
  'DE',
  'DA',
  'DO',
  'DAS',
  'DOS',
  'E',
  'A',
  'O',
  'AS',
  'OS',
  'EM',
  'NO',
  'NA',
  'NOS',
  'NAS',
  'AO',
  'AOS',
  'PARA',
  'POR',
  'COM',
]);

const ROMAN_MAP: Record<string, string> = {
  I: '1',
  II: '2',
  III: '3',
  IV: '4',
  V: '5',
  VI: '6',
  VII: '7',
  VIII: '8',
  IX: '9',
  X: '10',
};

export function stripEmojis(value: string): string {
  return value
    .replace(
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u2600-\u27BF\uFE0E\uFE0F\u200D\u20E3]/gu,
      ''
    )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();
}

export function normalizeText(value: string): string {
  return value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nome de departamento pronto para exibi\u00e7\u00e3o: remove prefixos institucionais
 * ("Departamento de", "Depto") e sufixos de c\u00f3digo ("\u2013 CIC") da planilha/SIGAA.
 */
export function normalizeDepartmentDisplay(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const withoutPrefix = cleaned.replace(
    /^(departamento|depto|dep)\.?\s+(de\s+|d[ao]\s+)?/i,
    ''
  );
  const withoutSuffix = withoutPrefix
    .replace(/\s*[-\u2013]\s*[a-z]{2,4}\s*$/i, '')
    .trim();
  const base = withoutSuffix || cleaned;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Agrupa variantes de escrita do mesmo departamento (caixa, acento, prefixos
 * "Departamento de/Depto", sufixos de c\u00f3digo) e reescreve todas com um \u00fanico
 * nome can\u00f4nico \u2014 o mais completo encontrado entre os relatos.
 */
export function canonicalizeDepartments(
  evaluations: ProfessorEvaluation[]
): ProfessorEvaluation[] {
  const keyOf = (raw: string) =>
    normalizeText(normalizeDepartmentDisplay(raw));
  const displayByKey = new Map<string, string>();

  for (const ev of evaluations) {
    const key = keyOf(ev.department);
    const current = displayByKey.get(key);
    if (!current || ev.department.trim().length > current.length) {
      displayByKey.set(key, normalizeDepartmentDisplay(ev.department));
    }
  }

  return evaluations.map((ev) => ({
    ...ev,
    department: displayByKey.get(keyOf(ev.department)) ?? ev.department,
  }));
}

export function normalizeDisciplineTokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => ROMAN_MAP[t] || t)
    .map((t) => (t.length > 4 ? t.replace(/S$/, '') : t));
}

export function isEditDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4 || b.length < 4) {
    return false;
  }
  let diffs = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      diffs++;
      if (diffs > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return true;
}

export function normalizeCampus(raw: string): CampusName {
  const norm = normalizeText(raw);
  if (norm.includes('DARCY')) return 'Darcy Ribeiro';
  if (norm.includes('CEILANDIA') || norm.includes('FCE')) return 'Ceilândia';
  if (norm.includes('GAMA') || norm.includes('FGA')) return 'Gama';
  if (norm.includes('PLANALTINA') || norm.includes('FUP')) return 'Planaltina';
  return 'Outro';
}

export function parseDidaticaScore(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const upper = normalizeText(trimmed);
  if (
    upper === 'EXCELENTE' ||
    upper === 'EXCEPCIONAL' ||
    trimmed.includes('∞')
  ) {
    return 10;
  }

  // Formato X/10
  const slashTen = trimmed.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*10\b/);
  if (slashTen) {
    const val = parseFloat(slashTen[1].replace(',', '.'));
    if (!Number.isNaN(val)) {
      return Math.max(0, Math.min(10, val));
    }
  }

  // Número puro (ex: "10", "8,5", "9.5", "-1", "100")
  if (/^-?\d+(?:[.,]\d+)?[!.]*$/.test(trimmed)) {
    const cleanNum = trimmed.replace(/[!]+$/g, '').replace(',', '.');
    const val = parseFloat(cleanNum);
    if (!Number.isNaN(val)) {
      return Math.max(0, Math.min(10, val));
    }
  }

  // Número no início da frase (ex: "0, ele nao deu aula", "10 DEZ")
  const leading = trimmed.match(/^(-?\d+(?:[.,]\d+)?)\b/);
  if (leading) {
    const val = parseFloat(leading[1].replace(',', '.'));
    if (!Number.isNaN(val)) {
      return Math.max(0, Math.min(10, val));
    }
  }

  // Qualquer número explícito até 10 na string
  const anyNumbers = Array.from(trimmed.matchAll(/\b(\d+(?:[.,]\d+)?)\b/g))
    .map((m) => parseFloat(m[1].replace(',', '.')))
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 10);

  if (anyNumbers.length > 0) {
    const sum = anyNumbers.reduce((acc, n) => acc + n, 0);
    return Math.round((sum / anyNumbers.length) * 10) / 10;
  }

  return null;
}

export function normalizeDifficulty(raw: string): {
  label: string;
  level?: DifficultyLevel;
} {
  const norm = normalizeText(raw);
  if (!norm) return { label: '' };
  if (norm.includes('GOD')) {
    return { label: 'Nível God', level: 'nivel_god' };
  }
  if (norm.includes('MUITO DIFICIL')) {
    return { label: 'Muito difícil', level: 'muito_dificil' };
  }
  if (norm.includes('DIFICIL')) {
    return { label: 'Difícil', level: 'dificil' };
  }
  if (norm.includes('MEDIO')) {
    return { label: 'Médio', level: 'medio' };
  }
  if (norm.includes('MUITO FACIL')) {
    return { label: 'Muito fácil', level: 'muito_facil' };
  }
  if (norm.includes('FACIL')) {
    return { label: 'Fácil', level: 'facil' };
  }
  return { label: stripEmojis(raw) };
}

export function normalizeWorkload(raw: string): {
  label: string;
  level?: WorkloadLevel;
} {
  const norm = normalizeText(raw);
  if (!norm) return { label: '' };
  if (norm.includes('EXAGERADA')) {
    return { label: 'Exagerada', level: 'exagerada' };
  }
  if (norm.includes('INTENSA')) {
    return { label: 'Intensa', level: 'intensa' };
  }
  if (norm.includes('MODERADA')) {
    return { label: 'Moderada', level: 'moderada' };
  }
  if (norm.includes('MUITO LEVE')) {
    return { label: 'Muito leve', level: 'muito_leve' };
  }
  if (norm.includes('LEVE')) {
    return { label: 'Leve', level: 'leve' };
  }
  return { label: stripEmojis(raw) };
}

export function normalizeRecommendation(raw: string): RecommendationType {
  const norm = normalizeText(raw);
  if (norm.includes('DEPENDE')) return 'depende';
  if (norm.includes('NAO')) return 'nao';
  return 'sim';
}

export function normalizeAttendance(raw: string): {
  label: string;
  strictness: AttendanceStrictness;
} {
  const norm = normalizeText(raw);
  if (!norm) return { label: '', strictness: 'nao_informado' };
  if (norm.includes('RIGOROSO')) {
    return { label: 'Rigoroso com chamada', strictness: 'rigoroso' };
  }
  if (norm.includes('TRANQUILO')) {
    return { label: 'Tranquilo com chamada', strictness: 'tranquilo' };
  }
  return { label: stripEmojis(raw), strictness: 'nao_informado' };
}

export function normalizeMaterial(raw: string): string {
  const norm = normalizeText(raw);
  if (!norm) return '';
  if (norm.includes('PRE-HISTORICO') || norm.includes('DESATUALIZADO')) {
    return 'Material desatualizado';
  }
  if (norm.includes('INEXISTENTE') || norm.includes('NAO DISPONIBILIZA')) {
    return 'Sem material';
  }
  if (norm.includes('INSUFICIENTE') || norm.includes('OUTRAS FONTES')) {
    return 'Material insuficiente';
  }
  if (norm.includes('SUFICIENTE')) {
    return 'Material suficiente';
  }
  return stripEmojis(raw);
}

/**
 * Normaliza o semestre ofertado informado pelos alunos na planilha
 * (ex: "2024.2", "24/2", "2025/01", "2/2024", "2024./2", "26.1") para o padrão "YYYY/S".
 * Valores que representam apenas semestre do fluxo (ex: "4 semestre", "Primeiro") retornam "-".
 */
export function normalizeSemester(raw: string): string {
  const cleaned = stripEmojis(raw)
    .replace(/20225/g, '2025')
    .replace(/2034/g, '2024')
    .replace(/2926/g, '2026')
    .replace(/\b(20[12]\d|[12]\d)\.q\b/gi, '$1/1')
    .trim();

  if (!cleaned) return '-';

  const found: string[] = [];
  const addSem = (yearStr: string, semStr: string) => {
    const yearNum =
      yearStr.length === 2
        ? 2000 + parseInt(yearStr, 10)
        : parseInt(yearStr, 10);
    const semNum = parseInt(semStr, 10);
    if (yearNum < 2010 || yearNum > 2030) return;
    if (semNum >= 0 && semNum <= 2) {
      const token = `${yearNum}/${semNum}`;
      if (!found.includes(token)) found.push(token);
    }
  };

  // Padrão 1: YYYY/S, YYYY.S, YYYY-S, YYYY S, YY/S, YY.S (ex: 2024/2, 2025.1, 2024./2, 24/2, 2025/02, 2023/1-2)
  const yearFirstRegex =
    /\b(20[12]\d|[12]\d)\s*(?:[./-]+\s*|\s+)0?([012])(?:\s*[-e/]\s*0?([12]))?\b/gi;
  for (const match of cleaned.matchAll(yearFirstRegex)) {
    addSem(match[1], match[2]);
    if (match[3]) {
      addSem(match[1], match[3]);
    }
  }

  // Padrão 2: S/YYYY, S.YYYY, Sº/YYYY (ex: 2/2024, 1/2025, 1º/2026)
  if (found.length === 0) {
    const semFirstRegex = /\b0?([12])(?:º|°|o)?\s*[./-]\s*(20[12]\d)\b/gi;
    for (const match of cleaned.matchAll(semFirstRegex)) {
      addSem(match[2], match[1]);
    }
  }

  // Padrão 3: YYYYS colado (ex: 20242 -> 2024/2)
  if (found.length === 0) {
    const compactMatch = cleaned.match(/\b(20[12]\d)([12])\b/);
    if (compactMatch) {
      addSem(compactMatch[1], compactMatch[2]);
    }
  }

  if (found.length > 0) {
    return found[found.length - 1];
  }

  // Padrão 4: Apenas o ano (ex: "2025", "2024", "2025/4")
  const yearOnlyMatch = cleaned.match(/\b(20[12]\d)\b/);
  if (yearOnlyMatch) {
    return yearOnlyMatch[1];
  }

  if (/^2[0-7]$/.test(cleaned)) {
    return `20${cleaned}`;
  }

  return '-';
}

/** Mínimo de relatos para considerar os níveis confirmados por vários alunos. */
export const CONSENSUS_MIN_EVALUATIONS = 3;
/** Maioria mínima de dificuldade entre os relatos que a informaram. */
export const CONSENSUS_MAJORITY_RATIO = 0.6;
/** Mínimo de relatos para exibir o selo de consenso ("muitas avaliações" convergindo). */
export const CONSENSUS_SEAL_MIN_EVALUATIONS = 5;

/**
 * Indica se um conjunto de avaliações (de um professor ou de uma matéria)
 * converge no nível de dificuldade: exige pelo menos
 * CONSENSUS_MIN_EVALUATIONS relatos e, entre os que informaram dificuldade,
 * maioria de CONSENSUS_MAJORITY_RATIO.
 */
export function hasConsistentDifficultyConsensus(
  evaluations: ProfessorEvaluation[]
): boolean {
  if (evaluations.length < CONSENSUS_MIN_EVALUATIONS) return false;

  const reported = evaluations
    .map((e) => e.difficultyLevel ?? '')
    .filter((v) => v);

  if (reported.length < 2) return false;

  const counts = new Map<string, number>();
  for (const v of reported) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const modeCount = Math.max(...counts.values());
  return modeCount / reported.length >= CONSENSUS_MAJORITY_RATIO;
}

export function parseBrTimestampToIso(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!match) return new Date(0).toISOString();

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3];
  const hour = (match[4] || '00').padStart(2, '0');
  const minute = (match[5] || '00').padStart(2, '0');
  const second = (match[6] || '00').padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

/**
 * Parser RFC 4180 para CSV (suporta vírgulas e quebras de linha dentro de aspas).
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let inQuotes = false;
  let rowIndex = 0;
  let colIndex = 0;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (!rows[rowIndex]) rows[rowIndex] = [];
    if (rows[rowIndex][colIndex] === undefined) rows[rowIndex][colIndex] = '';

    if (ch === '"' && inQuotes && next === '"') {
      rows[rowIndex][colIndex] += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      colIndex++;
      continue;
    }

    if (ch === '\r' && next === '\n' && !inQuotes) {
      rowIndex++;
      colIndex = 0;
      i++;
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      rowIndex++;
      colIndex = 0;
      continue;
    }

    rows[rowIndex][colIndex] += ch;
  }

  return rows.filter((r) => r.some((cell) => cell && cell.trim().length > 0));
}

export function parseProfessorEvaluationsCsv(
  csvText: string
): ProfessorEvaluation[] {
  const rows = parseCsvRows(csvText);
  if (rows.length <= 1) return [];

  const evaluations: ProfessorEvaluation[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const timestamp = stripEmojis(row[0] || '');
    const campusRaw = stripEmojis(row[1] || '');
    const discipline = stripEmojis(row[2] || '');
    const modality = stripEmojis(row[3] || '');
    const semester = stripEmojis(row[4] || '');
    const department = stripEmojis(row[5] || '');
    const professor = stripEmojis(row[6] || '');
    const didaticaRaw = stripEmojis(row[7] || '');
    const difficultyRaw = stripEmojis(row[8] || '');
    const workloadRaw = stripEmojis(row[9] || '');
    const materialRaw = stripEmojis(row[10] || '');
    const recommendationRaw = stripEmojis(row[11] || '');
    const feedback = stripEmojis(row[12] || '');
    const evaluationMethods = stripEmojis(row[13] || '');
    const hasMonitor = stripEmojis(row[14] || '');
    const attendanceRaw = stripEmojis(row[15] || '');
    const outcome = stripEmojis(row[16] || '');
    const caresAboutStudents = stripEmojis(row[17] || '');
    const learnedContent = stripEmojis(row[18] || '');

    if (!professor && !discipline) continue;

    // Ignora linhas óbvias de teste de formulário
    if (
      normalizeText(professor) === 'TESTE' &&
      normalizeText(discipline) === 'TESTE'
    ) {
      continue;
    }

    const diff = normalizeDifficulty(difficultyRaw);
    const work = normalizeWorkload(workloadRaw);
    const att = normalizeAttendance(attendanceRaw);

    evaluations.push({
      id: `eval-${i}`,
      timestamp,
      createdAtIso: parseBrTimestampToIso(timestamp),
      campus: normalizeCampus(campusRaw),
      campusRaw,
      discipline: discipline || 'Disciplina não informada',
      disciplineRaw: discipline,
      modality: modality || 'Presencial',
      semester: normalizeSemester(semester),
      department: department || 'UnB',
      professor: professor || 'Professor(a) não informado(a)',
      professorRaw: professor,
      didaticaScore: parseDidaticaScore(didaticaRaw),
      didaticaRaw,
      difficulty: diff.label,
      difficultyLevel: diff.level,
      workload: work.label,
      workloadLevel: work.level,
      material: normalizeMaterial(materialRaw),
      recommendation: normalizeRecommendation(recommendationRaw),
      recommendationRaw,
      feedback,
      evaluationMethods,
      hasMonitor,
      attendance: att.label,
      attendanceStrictness: att.strictness,
      outcome,
      caresAboutStudents,
      learnedContent,
    });
  }

  return evaluations;
}

interface SigaaDiscEntry {
  code: string;
  name: string;
  departmentId: string;
  normKey: string;
  acronyms: Set<string>;
}

interface SigaaProfEntry {
  name: string;
  normName: string;
  tokens: string[];
  siape?: string;
  photoUrl?: string;
  publicUrl?: string;
  departmentIds: Set<string>;
  departmentNamesNorm: Set<string>;
  disciplineCodes: Set<string>;
  disciplineNormKeys: Set<string>;
}

/**
 * Cruza os relatos da planilha com os catálogos oficiais do SIGAA (professores e disciplinas)
 * e consolida variações de nomes e matérias para evitar duplicatas.
 */
export function crossReferenceEvaluationsWithSigaa(
  evaluations: ProfessorEvaluation[],
  sigaaDisciplines: ScrapedDiscipline[] = [],
  sigaaProfessors: ScrapedProfessor[] = [],
  sigaaDepartments: Department[] = []
): ProfessorEvaluation[] {
  if (evaluations.length === 0) return [];

  const deptNormById = new Map<string, string>();
  const deptNameById = new Map<string, string>();
  for (const d of sigaaDepartments) {
    deptNormById.set(d.id, normalizeText(d.name));
    deptNameById.set(d.id, d.name);
  }

  // Sigla de departamento → nome oficial do catálogo: normaliza a escrita
  // livre da planilha (ex.: "CIC" → departamento de ciências da computação).
  const deptCodeToName = new Map<string, string>();
  for (const d of sigaaDepartments) {
    const codeMatch = d.name.match(/-\s*([A-Z]{2,4})\s*$/);
    if (codeMatch) deptCodeToName.set(normalizeText(codeMatch[1]), d.name);
  }
  const resolveDepartmentDisplay = (raw: string): string =>
    normalizeDepartmentDisplay(deptCodeToName.get(normalizeText(raw)) ?? raw);

  // 1. Indexa disciplinas do SIGAA por código, chave normalizada e siglas
  const discByCode = new Map<string, SigaaDiscEntry>();
  const discByNormKey = new Map<string, SigaaDiscEntry[]>();
  const discByAcronym = new Map<string, SigaaDiscEntry[]>();

  for (const d of sigaaDisciplines) {
    const code = d.code.trim().toUpperCase();
    const name = d.name.trim().replace(/^Prof\.?\s+/i, '');
    const normKey = normalizeDisciplineTokens(name).join(' ');
    const acronyms = new Set<string>(
      [d.acronym, ...(d.acronyms || [])]
        .filter((a): a is string => Boolean(a))
        .map((a) => normalizeText(a))
    );

    let entry = discByCode.get(code);
    if (!entry) {
      entry = {
        code,
        name,
        departmentId: d.departmentId,
        normKey,
        acronyms,
      };
      discByCode.set(code, entry);
    }

    if (normKey) {
      const list = discByNormKey.get(normKey) || [];
      if (!list.some((x) => x.code === code)) {
        list.push(entry);
        discByNormKey.set(normKey, list);
      }
    }

    for (const ac of acronyms) {
      if (ac.length >= 2) {
        const list = discByAcronym.get(ac) || [];
        if (!list.some((x) => x.code === code)) {
          list.push(entry);
          discByAcronym.set(ac, list);
        }
      }
    }
  }

  // 2. Indexa professores do SIGAA (diretório de docentes + turmas ofertadas)
  const profByNorm = new Map<string, SigaaProfEntry>();

  const ensureProf = (rawName: string): SigaaProfEntry | null => {
    const clean = rawName.replace(/^Prof(?:essor|essora)?\.?\s+/i, '').trim();
    if (!clean || clean.toUpperCase() === 'A DEFINIR') return null;
    const normName = normalizeText(clean);
    if (!normName) return null;

    let entry = profByNorm.get(normName);
    if (!entry) {
      entry = {
        name: clean.toUpperCase(),
        normName,
        tokens: normName.split(' ').filter((t) => t && !STOPWORDS.has(t)),
        departmentIds: new Set<string>(),
        departmentNamesNorm: new Set<string>(),
        disciplineCodes: new Set<string>(),
        disciplineNormKeys: new Set<string>(),
      };
      profByNorm.set(normName, entry);
    }
    return entry;
  };

  for (const p of sigaaProfessors) {
    const entry = ensureProf(p.name);
    if (!entry) continue;
    if (p.siape && !entry.siape) entry.siape = p.siape;
    if (p.photoUrl && !entry.photoUrl) entry.photoUrl = p.photoUrl;
    if (p.publicUrl && !entry.publicUrl) entry.publicUrl = p.publicUrl;
    if (p.departmentId) entry.departmentIds.add(p.departmentId);
    if (p.departmentName) {
      entry.departmentNamesNorm.add(normalizeText(p.departmentName));
    }
    for (const dId of p.departmentIds || []) {
      entry.departmentIds.add(dId);
      const dName = deptNormById.get(dId);
      if (dName) entry.departmentNamesNorm.add(dName);
    }
    for (const code of p.disciplineCodes || []) {
      const upperCode = code.trim().toUpperCase();
      entry.disciplineCodes.add(upperCode);
      const dEntry = discByCode.get(upperCode);
      if (dEntry?.normKey) entry.disciplineNormKeys.add(dEntry.normKey);
    }
  }

  for (const d of sigaaDisciplines) {
    const code = d.code.trim().toUpperCase();
    const normKey = normalizeDisciplineTokens(d.name).join(' ');
    const dNameNorm = deptNormById.get(d.departmentId);

    for (const c of d.classes || []) {
      for (const t of c.teachers || []) {
        const entry = ensureProf(t);
        if (!entry) continue;
        entry.disciplineCodes.add(code);
        if (normKey) entry.disciplineNormKeys.add(normKey);
        if (d.departmentId) entry.departmentIds.add(d.departmentId);
        if (dNameNorm) entry.departmentNamesNorm.add(dNameNorm);
      }
    }
  }

  const allSigaaProfs = Array.from(profByNorm.values());

  // 3. Primeiro passe: resolve disciplinas e professores contra o catálogo do SIGAA
  const canonicalDiscDisplayByNormKey = new Map<string, string>();

  const resolvedFirstPass = evaluations.map((ev) => {
    const rawDisc = (ev.disciplineRaw ?? ev.discipline).trim();
    const rawProf = (ev.professorRaw ?? ev.professor).trim();
    const rawDeptNorm = normalizeText(ev.department);

    // 3a. Matching de Disciplina
    let matchedDisc: SigaaDiscEntry | null = null;
    let extractedCode: string | undefined;

    const codeMatch = rawDisc.match(/\b([A-Z]{3}\d{4})\b/i);
    if (codeMatch) {
      extractedCode = codeMatch[1].toUpperCase();
      matchedDisc = discByCode.get(extractedCode) || null;
    }

    const strippedDiscText = rawDisc
      .replace(/\b[A-Z]{3}\d{4}\b/gi, '')
      .replace(/^[-–—()\s]+|[-–—()\s]+$/g, '')
      .trim();
    const discNormKey = normalizeDisciplineTokens(
      strippedDiscText || rawDisc
    ).join(' ');

    if (!matchedDisc && discNormKey) {
      const candidates = discByNormKey.get(discNormKey);
      if (candidates && candidates.length > 0) {
        if (candidates.length === 1) {
          matchedDisc = candidates[0];
        } else {
          // Desempata pelo departamento informado na linha
          const byDept = candidates.find((c) => {
            const cDeptNorm = deptNormById.get(c.departmentId) || '';
            return (
              rawDeptNorm &&
              (cDeptNorm.includes(rawDeptNorm) ||
                rawDeptNorm.includes(c.code.slice(0, 3)))
            );
          });
          matchedDisc = byDept || candidates[0];
        }
      }
    }

    // Matching por sigla (ex: "APC", "ISOL", "OAC") quando não casou pelo nome completo
    if (!matchedDisc && strippedDiscText) {
      const acronymCand = normalizeText(strippedDiscText);
      const byAcronym = discByAcronym.get(acronymCand);
      if (byAcronym && byAcronym.length === 1) {
        matchedDisc = byAcronym[0];
      }
    }

    let finalDiscipline = rawDisc;
    let finalDisciplineCode = extractedCode;

    if (matchedDisc) {
      finalDisciplineCode = matchedDisc.code;
      finalDiscipline = `${matchedDisc.code} - ${matchedDisc.name}`;
      if (matchedDisc.normKey) {
        canonicalDiscDisplayByNormKey.set(matchedDisc.normKey, finalDiscipline);
      }
    } else if (extractedCode && strippedDiscText) {
      finalDiscipline = `${extractedCode} - ${strippedDiscText.toUpperCase()}`;
      if (discNormKey) {
        canonicalDiscDisplayByNormKey.set(discNormKey, finalDiscipline);
      }
    } else if (discNormKey) {
      const existingDisplay = canonicalDiscDisplayByNormKey.get(discNormKey);
      if (existingDisplay) {
        finalDiscipline = existingDisplay;
      } else {
        canonicalDiscDisplayByNormKey.set(discNormKey, rawDisc);
      }
    }

    // 3b. Matching de Professor
    const cleanedProfInput = normalizeText(
      rawProf
        .replace(/\(.*?\)/g, ' ')
        .replace(/^(?:PROF(?:ESSOR|ESSORA)?|DR|DRA)\.?\s+/i, '')
    );
    const profInputTokens = cleanedProfInput
      .split(' ')
      .filter((t) => t && !STOPWORDS.has(t));

    // Evita fundir registros com múltiplos professores na mesma célula (ex: "Yris e Dâmaris")
    const isMultiProfessor = /\bE\b|\/|;/.test(
      rawProf
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    );

    let matchedProf: SigaaProfEntry | null = null;

    if (!isMultiProfessor && cleanedProfInput) {
      const exact = profByNorm.get(cleanedProfInput);
      if (exact) {
        matchedProf = exact;
      } else if (profInputTokens.length > 0 && allSigaaProfs.length > 0) {
        const targetDiscKey = matchedDisc?.normKey || discNormKey;
        const scored: Array<{
          cand: SigaaProfEntry;
          score: number;
          teachesDisc: boolean;
        }> = [];

        for (const cand of allSigaaProfs) {
          if (cand.tokens.length === 0) continue;

          // O primeiro nome precisa bater (com tolerância de 1 caractere para nomes >= 4 letras)
          if (!isEditDistanceAtMostOne(profInputTokens[0], cand.tokens[0])) {
            continue;
          }

          // Todos os tokens informados pelo aluno devem existir no nome completo oficial do docente
          const allTokensMatch = profInputTokens.every((pt) =>
            cand.tokens.some((ct) => isEditDistanceAtMostOne(pt, ct))
          );
          if (!allTokensMatch) continue;

          let score = profInputTokens.length * 10;

          const teachesDisc = Boolean(
            (finalDisciplineCode &&
              cand.disciplineCodes.has(finalDisciplineCode)) ||
              (targetDiscKey && cand.disciplineNormKeys.has(targetDiscKey))
          );
          if (teachesDisc) {
            score += 60;
          }

          const matchesDept =
            rawDeptNorm.length >= 3 &&
            Array.from(cand.departmentNamesNorm).some(
              (dn) => dn.includes(rawDeptNorm) || rawDeptNorm.includes(dn)
            );
          if (matchesDept) {
            score += 20;
          }

          scored.push({ cand, score, teachesDisc });
        }

        scored.sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          const top = scored[0];
          const second = scored[1];
          const isUnambiguous = !second || top.score > second.score;

          if (
            top.teachesDisc ||
            (profInputTokens.length >= 2 && isUnambiguous)
          ) {
            matchedProf = top.cand;
          }
        }
      }
    }

    // Se o professor casou e a matéria tinha múltiplas opções ou não tinha código, refina pelo professor
    if (matchedProf && !matchedDisc && discNormKey) {
      for (const code of matchedProf.disciplineCodes) {
        const dEntry = discByCode.get(code);
        if (dEntry && dEntry.normKey === discNormKey) {
          finalDisciplineCode = dEntry.code;
          finalDiscipline = `${dEntry.code} - ${dEntry.name}`;
          break;
        }
      }
    }

    // Departamento oficial do catálogo quando a matéria casou com o SIGAA:
    // relatos da mesma disciplina compartilham o mesmo departamento, em vez
    // das variantes livres escritas pelos alunos ("IF", "Física", "Instituto
    // de física").
    const department =
      matchedDisc && deptNameById.has(matchedDisc.departmentId)
        ? resolveDepartmentDisplay(deptNameById.get(matchedDisc.departmentId)!)
        : resolveDepartmentDisplay(ev.department);

    return {
      ...ev,
      department,
      discipline: finalDiscipline,
      disciplineCode: finalDisciplineCode,
      professor: matchedProf ? matchedProf.name : ev.professor.trim(),
      siape: matchedProf?.siape ?? ev.siape,
      photoUrl: matchedProf?.photoUrl ?? ev.photoUrl,
      publicUrl: matchedProf?.publicUrl ?? ev.publicUrl,
      isSigaaVerified: Boolean(matchedProf),
      _discNormKey: matchedDisc?.normKey || discNormKey,
      _isMultiProf: isMultiProfessor,
    };
  });

  // 4. Segundo passe: consolidação intra-planilha para evitar duplicatas de nomes parciais ou matérias sem código
  const fullProfCandidates = new Map<
    string,
    {
      displayName: string;
      tokens: string[];
      discKeys: Set<string>;
      siape?: string;
      photoUrl?: string;
      publicUrl?: string;
      isSigaaVerified?: boolean;
    }
  >();

  for (const item of resolvedFirstPass) {
    if (item._isMultiProf) continue;
    const normP = normalizeText(
      item.professor.replace(/^Prof(?:essor|essora)?\.?\s+/i, '')
    );
    const tokens = normP.split(' ').filter((t) => t && !STOPWORDS.has(t));
    if (tokens.length < 2) continue;

    const existing = fullProfCandidates.get(normP);
    if (existing) {
      if (item._discNormKey) existing.discKeys.add(item._discNormKey);
      if (item.professor.length > existing.displayName.length) {
        existing.displayName = item.professor;
      }
    } else {
      fullProfCandidates.set(normP, {
        displayName: item.professor,
        tokens,
        discKeys: item._discNormKey
          ? new Set([item._discNormKey])
          : new Set(),
        siape: item.siape,
        photoUrl: item.photoUrl,
        publicUrl: item.publicUrl,
        isSigaaVerified: item.isSigaaVerified,
      });
    }
  }

  const allFullCandidates = Array.from(fullProfCandidates.values());

  return resolvedFirstPass.map((item) => {
    const { _discNormKey, _isMultiProf, ...cleanEv } = item;

    // Unifica nome da disciplina se outra linha da planilha já resolveu a mesma chave para código SIGAA
    if (
      !cleanEv.disciplineCode &&
      _discNormKey &&
      canonicalDiscDisplayByNormKey.has(_discNormKey)
    ) {
      cleanEv.discipline = canonicalDiscDisplayByNormKey.get(_discNormKey)!;
    }

    if (_isMultiProf || cleanEv.isSigaaVerified) {
      return cleanEv;
    }

    const normP = normalizeText(
      cleanEv.professor.replace(/^Prof(?:essor|essora)?\.?\s+/i, '')
    );
    const tokens = normP.split(' ').filter((t) => t && !STOPWORDS.has(t));
    if (tokens.length === 0) return cleanEv;

    // Procura um candidato mais completo na própria planilha (ex: "André Lemes Lopes" -> "ANDRE PEREIRA LEME LOPES")
    const matches = allFullCandidates.filter((cand) => {
      if (cand.tokens.length <= tokens.length) return false;
      if (!isEditDistanceAtMostOne(tokens[0], cand.tokens[0])) return false;
      const subsetMatch = tokens.every((pt) =>
        cand.tokens.some((ct) => isEditDistanceAtMostOne(pt, ct))
      );
      if (!subsetMatch) return false;
      if (tokens.length === 1) {
        return Boolean(_discNormKey && cand.discKeys.has(_discNormKey));
      }
      return true;
    });

    if (matches.length === 1) {
      const best = matches[0];
      return {
        ...cleanEv,
        professor: best.displayName,
        siape: best.siape ?? cleanEv.siape,
        photoUrl: best.photoUrl ?? cleanEv.photoUrl,
        publicUrl: best.publicUrl ?? cleanEv.publicUrl,
        isSigaaVerified: best.isSigaaVerified ?? cleanEv.isSigaaVerified,
      };
    }

    return cleanEv;
  });
}
