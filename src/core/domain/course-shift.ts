/** Turno de um curso/matriz da UnB (DIURNO / NOTURNO / INTEGRAL). */
export type ShiftFamily = 'DIURNO' | 'NOTURNO' | 'INTEGRAL';

const FAMILY_INITIAL: Record<ShiftFamily, string> = {
  DIURNO: 'D',
  NOTURNO: 'N',
  INTEGRAL: 'I',
};

/** Normaliza token de turno para a primeira letra representativa em maiúsculo. */
function initialOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const clean = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
  return clean[0] || null;
}

/** Converte token de turno do SIGAA na família canônica correspondente. */
export function shiftFamilyFromSigaaToken(token: string | null | undefined): ShiftFamily | null {
  switch (initialOf(token)) {
    case 'N':
      return 'NOTURNO';
    case 'D':
      return 'DIURNO';
    case 'I':
      return 'INTEGRAL';
    case 'M':
    case 'V':
    case 'T':
      return 'DIURNO';
    default:
      return null;
  }
}

/** Verifica se o turno do catálogo pertence à família especificada. */
export function catalogShiftMatchesFamily(
  catalogShift: string | null | undefined,
  family: ShiftFamily
): boolean {
  const catalogInitial = initialOf(catalogShift);
  if (!catalogInitial) return false;
  if (family === 'NOTURNO') return catalogInitial === 'N';
  if (family === 'INTEGRAL') return catalogInitial === 'I';
  return catalogInitial !== 'N';
}

/** Ordena matrizes priorizando compatibilidade com o turno do discente. */
export function preferShiftCompatible<T extends { shift?: string | null }>(
  items: T[],
  family: ShiftFamily | null
): T[] {
  if (!family || items.length <= 1) return items;
  const rank = (shift: string | null | undefined): number => {
    const initial = initialOf(shift);
    if (!initial) return 2;
    if (initial === FAMILY_INITIAL[family]) return 0;
    if (family === 'DIURNO' && initial !== 'N') return 1;
    return 2;
  };
  return [...items].sort((a, b) => rank(a.shift) - rank(b.shift));
}

/** Seleciona a matriz mais recente criada até o ano de ingresso do discente. */
export function resolveCurriculumByAdmissionYear<T extends { createdYear?: string | null }>(
  candidates: T[],
  admissionYear?: string | null,
): T | undefined {
  if (!candidates || candidates.length === 0 || !admissionYear) return undefined;
  const admYear = parseInt(admissionYear.split('.')[0], 10);
  if (isNaN(admYear)) return undefined;

  const compatible = candidates
    .filter((c) => {
      if (!c.createdYear) return true;
      const yr = parseInt(c.createdYear, 10);
      return !isNaN(yr) && yr <= admYear;
    })
    .sort((a, b) => {
      const yrA = a.createdYear ? parseInt(a.createdYear, 10) : 0;
      const yrB = b.createdYear ? parseInt(b.createdYear, 10) : 0;
      return yrB - yrA;
    });

  return compatible[0];
}
