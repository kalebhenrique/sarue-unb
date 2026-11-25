/**
 * Sanitização do extrato bruto do RU (SIGAA "Extrato no Restaurante Universitário").
 *
 * O relatório oficial vem com linhas de controle contábil ("Saldo", "Saldo Anterior")
 * e descrições com o prefixo redundante do grupo tarifário ("Grupo 1 Almoço"). Esta
 * camada de domínio produz as entradas prontas para exibição: descrição limpa, tipo
 * semântico (refeição ou recarga/crédito), flag de isenção e data compacta.
 */
export interface RuStatementInput {
  description: string;
  occurredAt: string;
  amount: number | null;
}

export type RuStatementKind = 'meal' | 'credit';

export interface CleanRuStatementEntry {
  /** Descrição sem o prefixo "Grupo X " (ex.: "Almoço"). */
  description: string;
  /** Data/hora compacta pt-BR (ex.: "24/11 • 20:23"); cai para o bruto se não parsear. */
  occurredAtShort: string;
  /** ISO bruto original, para keys e ordenação estável. */
  occurredAt: string;
  kind: RuStatementKind;
  /** Refeição com valor zero (ex.: Grupo 1). Renderiza badge "Isento" em vez de "R$ 0,00". */
  isExempt: boolean;
  amount: number | null;
}

const ACCOUNT_CONTROL_LINES = new Set(['saldo', 'saldo anterior']);

const REDUNDANT_GROUP_PREFIX_RE = /^grupo\s*\d+\s*/i;

const CREDIT_RE = /recarga|dep[oó]sito|cr[eé]dito|boleto|pix/i;

const MEAL_RE = /desjejum|caf[eé]|almo[cç]o|jantar|refei[cç][aã]o/i;

/** "24/11/2026 20:23" -> "24/11 • 20:23" */
export function formatRuStatementDate(raw: string): string {
  const match = raw.match(/^(\d{2})\/(\d{2})\/\d{4}\s+(\d{2}:\d{2})/);
  if (!match) return raw;
  return `${match[1]}/${match[2]} • ${match[3]}`;
}

export function cleanRuStatementEntry(entry: RuStatementInput): CleanRuStatementEntry | null {
  const rawDescription = entry.description?.trim() ?? '';
  if (!rawDescription) return null;

  // Linhas de controle contábil não são movimentações reais.
  if (ACCOUNT_CONTROL_LINES.has(rawDescription.toLowerCase())) return null;

  const description = rawDescription.replace(REDUNDANT_GROUP_PREFIX_RE, '').trim();
  if (!description) return null;

  const amount = typeof entry.amount === 'number' && Number.isFinite(entry.amount)
    ? entry.amount
    : null;

  // Recarga/crédito: valores negativos são sempre saída (refeição); valores não negativos
  // com texto de crédito ou positivos sem texto de refeição são crédito.
  const looksLikeCredit = CREDIT_RE.test(description);
  const looksLikeMeal = MEAL_RE.test(description);
  const isCredit =
    amount !== null && amount < 0
      ? false
      : looksLikeCredit
        ? amount === null || amount >= 0
        : amount !== null && amount > 0 && !looksLikeMeal;

  return {
    description,
    occurredAtShort: formatRuStatementDate(entry.occurredAt ?? ''),
    occurredAt: entry.occurredAt ?? '',
    kind: isCredit ? 'credit' : 'meal',
    isExempt: !isCredit && amount === 0,
    amount,
  };
}

export function cleanRuStatement(entries: RuStatementInput[]): CleanRuStatementEntry[] {
  if (!Array.isArray(entries)) return [];
  const cleaned: CleanRuStatementEntry[] = [];
  for (const entry of entries) {
    const clean = cleanRuStatementEntry(entry);
    if (clean) cleaned.push(clean);
  }
  return cleaned;
}
