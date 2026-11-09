/**
 * Utilitários para identificação de formato de aulas (1, 2 ou 4 horas por encontro)
 * e cálculo de risco de reprovação por faltas com base na regra de 25% da UnB.
 */

export interface AbsenceStatus {
  /** Quantidade de faltas registradas no SIGAA (horas-falta) */
  absences: number;
  /** Limite máximo permitido de faltas na UnB (25% da carga horária) */
  maxAbsences: number;
  /** Duração de cada aula/encontro em horas (1, 2 ou 4) */
  hoursPerClass: 1 | 2 | 4;
  /** Faltas restantes antes de atingir o limite (maxAbsences - absences) */
  remainingAbsences: number;
  /** Quantas aulas completas o aluno ainda pode faltar sem reprovar */
  safeClassesToMiss: number;
  /** Quantas faltas de aula levam à reprovação por faltas */
  classesUntilReproval: number;
  /** Porcentagem do limite de 25% consumida (0 a 100+%) */
  percentageUsed: number;
  /** Se o aluno está prestes a atingir o limite (<= 2 aulas para reprovar) */
  isAtRisk: boolean;
  /** Se a situação é crítica (falta apenas 1 aula para reprovar) */
  isCritical: boolean;
  /** Se o aluno ultrapassou o limite máximo de faltas da UnB */
  isExceeded: boolean;
  /** Mensagem resumida de status para a UI e notificações */
  warningMessage?: string;
}

/**
 * Calcula a quantidade de créditos a partir do código de horário SIGAA da UnB
 * (ex: 35T45 -> 4 créditos, 4M1234 -> 4 créditos, 235M34 -> 6 créditos, 6M34 -> 2 créditos).
 */
export function parseCreditsFromSchedule(schedule?: string | null): number {
  if (!schedule) return 4;

  const regex = /([2-7]+)[MTN]([1-6]+)/g;
  let credits = 0;
  for (const match of schedule.matchAll(regex)) {
    const days = match[1].length;
    const periods = match[2].length;
    credits += days * periods;
  }

  return credits > 0 ? credits : 4;
}

/**
 * Calcula o limite máximo de faltas permitido na UnB pela regra de 25% da carga horária,
 * expresso em dias/encontros de aula:
 * Carga horária = créditos * 15h. Limite de 25% = carga * 0.25 (horas-falta).
 * Limite em dias de aula = floor(horas-falta / horasPorEncontro).
 * 
 * Ex:
 * - 4 créditos (60h), 2h/dia -> floor(15 / 2) = 7 faltas (dias)
 * - 4 créditos (60h), 4h/dia (ex: 4M1234) -> floor(15 / 4) = 3 faltas (dias)
 * - 6 créditos (90h), 2h/dia -> floor(22.5 / 2) = 11 faltas (dias)
 * - 2 créditos (30h), 2h/dia -> floor(7.5 / 2) = 3 faltas (dias)
 */
export function calculateMaxAbsences(credits: number, hoursPerClass: 1 | 2 | 4 = 2): number {
  const safeCredits = Math.max(1, credits);
  const safeHours = hoursPerClass || 2;
  const maxHoursAllowed = safeCredits * 15 * 0.25;
  return Math.max(1, Math.floor(maxHoursAllowed / safeHours));
}

/**
 * Converte a contagem de faltas do SIGAA (registrada em horas-falta) para a quantidade
 * de dias/aulas faltadas, considerando a duração do encontro (1, 2 ou 4 horas).
 * Ex: 22h registradas no SIGAA em aula de 2h -> 11 dias/aulas.
 */
export function convertSigaaHoursToClassAbsences(
  sigaaHours?: number | null,
  schedule?: string | null,
  hoursPerClass?: 1 | 2 | 4 | null
): number | undefined {
  if (sigaaHours === null || sigaaHours === undefined) return undefined;
  const h = hoursPerClass || parseHoursPerClass(schedule);
  return Math.max(0, Math.floor(sigaaHours / h));
}

/**
 * Identifica a quantidade de horas-aula por encontro (1, 2 ou 4) a partir do código
 * de horário padrão do SIGAA/UnB (ex.: 35T45 -> 2h, 4M1234 -> 4h, 6T1 -> 1h).
 */
export function parseHoursPerClass(schedule?: string | null): 1 | 2 | 4 {
  if (!schedule) return 2;

  // Regex para blocos de horário SIGAA: [Dias][Turno][Horários], ex: "35T45", "4M1234", "6T1", "246N12"
  const regex = /([2-7]+)[MTN]([1-6]+)/g;
  const matches = Array.from(schedule.matchAll(regex));

  if (matches.length === 0) return 2;

  // Mapeia a quantidade de períodos (horas) de cada bloco
  const periodCounts = matches.map((m) => m[2].length);

  // Se houver múltiplos blocos, busca o tamanho mais frequente ou o máximo
  const maxPeriods = Math.max(...periodCounts);

  if (maxPeriods >= 4) return 4;
  if (maxPeriods === 1) return 1;
  return 2;
}

export interface CalculateAbsenceRiskParams {
  absences?: number | null;
  maxAbsences?: number | null;
  schedule?: string | null;
  hoursPerClass?: number | null;
}

/**
 * Estima a situação de faltas do estudante na UnB:
 * - Regra de limite de faltas UnB: 25% da carga horária em dias/aulas.
 * - Formato da aula: 1, 2 ou 4 horas por encontro.
 * - Estima quantas aulas faltam para reprovação.
 */
export function calculateAbsenceRisk(params: CalculateAbsenceRiskParams): AbsenceStatus {
  const absences = Math.max(0, Number(params.absences) || 0);

  let hoursPerClass: 1 | 2 | 4 = 2;
  if (params.hoursPerClass === 1 || params.hoursPerClass === 2 || params.hoursPerClass === 4) {
    hoursPerClass = params.hoursPerClass;
  } else {
    hoursPerClass = parseHoursPerClass(params.schedule);
  }

  const credits = parseCreditsFromSchedule(params.schedule);
  const calculatedMax = calculateMaxAbsences(credits, hoursPerClass);

  // Se schedule estiver presente, usamos calculatedMax para garantir a regra exata de dias/encontros (especialmente para aulas de 4h ou créditos variados).
  // Se não estiver presente, recorre a params.maxAbsences ou calculatedMax.
  let maxAbsences = params.schedule
    ? calculatedMax
    : params.maxAbsences ? Number(params.maxAbsences) : calculatedMax;

  if (maxAbsences === 15 && credits !== 8) {
    maxAbsences = calculatedMax;
  }
  maxAbsences = Math.max(1, maxAbsences);

  const remainingAbsences = maxAbsences - absences;
  const percentageUsed = Math.round((absences / maxAbsences) * 100);

  if (absences > maxAbsences) {
    return {
      absences,
      maxAbsences,
      hoursPerClass,
      remainingAbsences,
      safeClassesToMiss: 0,
      classesUntilReproval: 0,
      percentageUsed,
      isAtRisk: true,
      isCritical: true,
      isExceeded: true,
      warningMessage: `Limite de 25% excedido (${absences}/${maxAbsences} faltas). Reprovado por faltas na UnB.`,
    };
  }

  // Como absences e maxAbsences já estão em dias/encontros de aula:
  const safeClassesToMiss = Math.max(0, remainingAbsences);

  // Quantas faltas de aula levam à reprovação (newAbsences > maxAbsences)
  const classesUntilReproval = Math.max(0, remainingAbsences + 1);

  // Se o aluno tem 0 faltas, ele nunca está em situação de risco ou crítica
  const isCritical = absences > 0 && classesUntilReproval === 1;
  const isAtRisk = absences > 0 && classesUntilReproval <= 2;

  let warningMessage: string | undefined;
  if (isCritical) {
    warningMessage = `Alerta Crítico: Resta apenas 1 aula (${hoursPerClass}h) para a reprovação por faltas!`;
  } else if (isAtRisk) {
    warningMessage = `Atenção: Restam apenas 2 aulas (${hoursPerClass}h cada) para atingir o limite de reprovação.`;
  }

  return {
    absences,
    maxAbsences,
    hoursPerClass,
    remainingAbsences,
    safeClassesToMiss,
    classesUntilReproval,
    percentageUsed,
    isAtRisk,
    isCritical,
    isExceeded: false,
    warningMessage,
  };
}
