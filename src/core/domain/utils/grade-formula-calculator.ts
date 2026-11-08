/**
 * Utilitário de análise de fórmulas matemáticas e estimativa de notas e aprovação na UnB.
 *
 * Suporta:
 * - Expressões aritméticas seguras (+, -, *, /, parênteses, decimais com '.' ou ',')
 * - Extração automática de variáveis de avaliação (ex: P1, P2, T, L1, etc.)
 * - Avaliação de fórmulas sem eval()
 * - Cálculo da nota restante necessária para atingir a aprovação (MM >= 5.0) e menções superiores (MS >= 7.0, SS >= 9.0)
 * - Mapeamento oficial de notas para Menções da UnB (SS, MS, MM, MI, II, SR)
 */

export type UnbMention = "SS" | "MS" | "MM" | "MI" | "II" | "SR";

export interface UnbMentionInfo {
  mention: UnbMention;
  label: string;
  minGrade: number;
  passed: boolean;
  colorClass: string;
}

export const UNB_MENTIONS_INFO: Record<UnbMention, UnbMentionInfo> = {
  SS: {
    mention: "SS",
    label: "Superior",
    minGrade: 9.0,
    passed: true,
    colorClass: "bg-emerald-500 text-white dark:bg-emerald-600",
  },
  MS: {
    mention: "MS",
    label: "Médio Superior",
    minGrade: 7.0,
    passed: true,
    colorClass: "bg-blue-600 text-white dark:bg-blue-500",
  },
  MM: {
    mention: "MM",
    label: "Médio Médio",
    minGrade: 5.0,
    passed: true,
    colorClass: "bg-amber-500 text-black dark:bg-amber-400",
  },
  MI: {
    mention: "MI",
    label: "Médio Inferior",
    minGrade: 3.0,
    passed: false,
    colorClass: "bg-orange-500 text-white dark:bg-orange-600",
  },
  II: {
    mention: "II",
    label: "Inferior",
    minGrade: 0.1,
    passed: false,
    colorClass: "bg-red-600 text-white dark:bg-red-700",
  },
  SR: {
    mention: "SR",
    label: "Sem Rendimento",
    minGrade: 0.0,
    passed: false,
    colorClass: "bg-neutral-500 text-white dark:bg-neutral-600",
  },
};

/**
 * Retorna a Menção UnB correspondente à nota final (0.0 a 10.0).
 */
export function getUnbMention(grade: number): UnbMentionInfo {
  const rounded = Math.round(grade * 100) / 100;
  if (rounded >= 9.0) return UNB_MENTIONS_INFO.SS;
  if (rounded >= 7.0) return UNB_MENTIONS_INFO.MS;
  if (rounded >= 5.0) return UNB_MENTIONS_INFO.MM;
  if (rounded >= 3.0) return UNB_MENTIONS_INFO.MI;
  if (rounded > 0.0) return UNB_MENTIONS_INFO.II;
  return UNB_MENTIONS_INFO.SR;
}

// Tokenizer & AST Parser para fórmulas aritméticas
type TokenType = "NUMBER" | "IDENT" | "PLUS" | "MINUS" | "MUL" | "DIV" | "LPAREN" | "RPAREN" | "EOF";

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

function tokenize(expression: string): { tokens: Token[]; error?: string } {
  const tokens: Token[] = [];
  let i = 0;
  // Substitui vírgula decimal brasileira entre dígitos por ponto
  const normalized = expression.replace(/(\d+),(\d+)/g, "$1.$2");

  while (i < normalized.length) {
    const ch = normalized[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "+") {
      tokens.push({ type: "PLUS", value: "+", pos: i });
      i++;
    } else if (ch === "-") {
      tokens.push({ type: "MINUS", value: "-", pos: i });
      i++;
    } else if (ch === "*" || ch === "×") {
      tokens.push({ type: "MUL", value: "*", pos: i });
      i++;
    } else if (ch === "/" || ch === "÷") {
      tokens.push({ type: "DIV", value: "/", pos: i });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(", pos: i });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")", pos: i });
      i++;
    } else if (/\d|\./.test(ch)) {
      let numStr = "";
      const start = i;
      while (i < normalized.length && /[\d.]/.test(normalized[i])) {
        numStr += normalized[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: numStr, pos: start });
    } else if (/[a-zA-Z_À-ÿ]/.test(ch)) {
      let ident = "";
      const start = i;
      while (i < normalized.length && /[a-zA-Z0-9_À-ÿ]/.test(normalized[i])) {
        ident += normalized[i];
        i++;
      }
      tokens.push({ type: "IDENT", value: ident, pos: start });
    } else {
      return { tokens: [], error: `Caractere inesperado '${ch}' na posição ${i + 1}` };
    }
  }

  tokens.push({ type: "EOF", value: "", pos: i });
  return { tokens };
}

type ASTNode =
  | { type: "Number"; value: number }
  | { type: "Variable"; name: string }
  | { type: "Unary"; op: "+" | "-"; expr: ASTNode }
  | { type: "Binary"; op: "+" | "-" | "*" | "/"; left: ASTNode; right: ASTNode };

class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.current] || { type: "EOF", value: "", pos: -1 };
  }

  private advance(): Token {
    const token = this.peek();
    if (token.type !== "EOF") {
      this.current++;
    }
    return token;
  }

  private match(...types: TokenType[]): boolean {
    if (types.includes(this.peek().type)) {
      this.advance();
      return true;
    }
    return false;
  }

  public parse(): ASTNode {
    const expr = this.expression();
    if (this.peek().type !== "EOF") {
      throw new Error(`Símbolo inesperado '${this.peek().value}'`);
    }
    return expr;
  }

  private expression(): ASTNode {
    let left = this.term(true);

    while (this.peek().type === "PLUS" || this.peek().type === "MINUS") {
      const op = this.advance().value as "+" | "-";
      const right = this.term(false);
      left = { type: "Binary", op, left, right };
    }

    return left;
  }

  private term(allowUnary = false): ASTNode {
    let left = this.factor(allowUnary);

    while (this.peek().type === "MUL" || this.peek().type === "DIV") {
      const op = this.advance().value as "*" | "/";
      const right = this.factor(false);
      left = { type: "Binary", op, left, right };
    }

    return left;
  }

  private factor(allowUnary = false): ASTNode {
    if (allowUnary && (this.peek().type === "PLUS" || this.peek().type === "MINUS")) {
      const op = this.advance().value as "+" | "-";
      const expr = this.primary();
      return { type: "Unary", op, expr };
    }

    return this.primary();
  }

  private primary(): ASTNode {
    const token = this.peek();

    if (token.type === "NUMBER") {
      this.advance();
      const val = parseFloat(token.value);
      if (isNaN(val)) {
        throw new Error(`Número inválido: '${token.value}'`);
      }
      return { type: "Number", value: val };
    }

    if (token.type === "IDENT") {
      this.advance();
      return { type: "Variable", name: token.value };
    }

    if (token.type === "LPAREN") {
      this.advance();
      const expr = this.expression();
      if (this.peek().type !== "RPAREN") {
        throw new Error("Parêntese ')' esperado para fechar a expressão");
      }
      this.advance();
      return expr;
    }

    throw new Error(
      token.type === "EOF"
        ? "Expressão matemática incompleta"
        : `Elemento inesperado '${token.value}'`
    );
  }
}

/**
 * Valida a sintaxe de uma fórmula matemática.
 */
export function validateFormula(formulaStr: string): { isValid: boolean; error?: string } {
  const trimmed = formulaStr.trim();
  if (!trimmed) {
    return { isValid: false, error: "A fórmula não pode ficar vazia." };
  }

  const { tokens, error: tokenError } = tokenize(trimmed);
  if (tokenError) {
    return { isValid: false, error: tokenError };
  }

  try {
    const parser = new Parser(tokens);
    parser.parse();
    return { isValid: true };
  } catch (err) {
    return {
      isValid: false,
      error: err instanceof Error ? err.message : "Fórmula inválida",
    };
  }
}

/**
 * Extrai a lista ordenada de variáveis únicas de uma fórmula matemática.
 * Exemplo: "(P1 + P2 + P3) / 3" -> ["P1", "P2", "P3"]
 * Exemplo: "0.4*P1 + 0.4*P2 + 0.2*T" -> ["P1", "P2", "T"]
 */
export function extractVariables(formulaStr: string): string[] {
  const { tokens, error } = tokenize(formulaStr);
  if (error) return [];

  const seen = new Set<string>();
  const vars: string[] = [];

  for (const token of tokens) {
    if (token.type === "IDENT" && !seen.has(token.value)) {
      seen.add(token.value);
      vars.push(token.value);
    }
  }

  return vars;
}

function evaluateAST(node: ASTNode, values: Record<string, number>): number {
  switch (node.type) {
    case "Number":
      return node.value;
    case "Variable": {
      const v = values[node.name];
      if (v === undefined || isNaN(v)) {
        throw new Error(`Valor da variável '${node.name}' não informado.`);
      }
      return v;
    }
    case "Unary": {
      const val = evaluateAST(node.expr, values);
      return node.op === "-" ? -val : val;
    }
    case "Binary": {
      const left = evaluateAST(node.left, values);
      const right = evaluateAST(node.right, values);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          if (right === 0) {
            throw new Error("Divisão por zero encontrada na fórmula.");
          }
          return left / right;
      }
    }
  }
}

/**
 * Avalia uma fórmula matemática com um dicionário de valores das variáveis.
 * Retorna null se houver erro ou variável ausente.
 */
export function evaluateFormula(
  formulaStr: string,
  values: Record<string, number>
): number | null {
  try {
    const { tokens, error: tokenError } = tokenize(formulaStr);
    if (tokenError) return null;
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const result = evaluateAST(ast, values);
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export interface TargetRequirement {
  targetMention: UnbMention;
  targetGrade: number;
  label: string;
  /** Nota que o aluno precisa tirar nas variáveis pendentes (de 0 a 10). */
  requiredGrade: number | null;
  /** Se o aluno já garantiu essa menção mesmo tirando 0 em tudo que resta. */
  isAlreadyAchieved: boolean;
  /** Se é viável atingir essa menção tirando até 10.0 nas restantes. */
  isAchievable: boolean;
  /** Nota máxima teórica atingível caso tire 10.0 em todas as restantes. */
  maxPossibleGrade: number;
}

export interface CalculationResult {
  /** Se todas as variáveis da fórmula foram preenchidas. */
  isFullyGraded: boolean;
  /** Nota final calculada (se todas as variáveis preenchidas). */
  finalGrade: number | null;
  /** Menção correspondente à nota final ou estimada. */
  finalMention: UnbMentionInfo | null;
  /** Avaliações já preenchidas pelo aluno. */
  filledVariables: string[];
  /** Avaliações ainda pendentes de nota. */
  pendingVariables: string[];
  /** Nota máxima possível se tirar 10.0 em todas as restantes. */
  maxPossibleGrade: number;
  /** Nota mínima já garantida se tirar 0.0 em todas as restantes. */
  minGuaranteedGrade: number;
  /** Requisitos para cada meta na UnB (MM = 5.0, MS = 7.0, SS = 9.0). */
  requirements: {
    MM: TargetRequirement;
    MS: TargetRequirement;
    SS: TargetRequirement;
  };
}

/**
 * Calcula os requisitos de aprovação e notas restantes com base na fórmula e nas notas já obtidas.
 */
export function calculateApprovalRequirements(
  formulaStr: string,
  enteredGrades: Record<string, number | null | undefined>
): CalculationResult | null {
  const validation = validateFormula(formulaStr);
  if (!validation.isValid) return null;

  const allVars = extractVariables(formulaStr);
  if (allVars.length === 0) return null;

  const filledVariables: string[] = [];
  const pendingVariables: string[] = [];
  const cleanGrades: Record<string, number> = {};

  for (const v of allVars) {
    const val = enteredGrades[v];
    if (val !== undefined && val !== null && !isNaN(val)) {
      filledVariables.push(v);
      cleanGrades[v] = val;
    } else {
      pendingVariables.push(v);
    }
  }

  const isFullyGraded = pendingVariables.length === 0;

  // Se todas estão preenchidas
  if (isFullyGraded) {
    const finalGrade = evaluateFormula(formulaStr, cleanGrades);
    if (finalGrade === null) return null;
    const rounded = Math.round(finalGrade * 100) / 100;
    const mention = getUnbMention(rounded);

    const dummyReq = (targetMention: UnbMention, targetGrade: number, label: string): TargetRequirement => ({
      targetMention,
      targetGrade,
      label,
      requiredGrade: null,
      isAlreadyAchieved: rounded >= targetGrade,
      isAchievable: rounded >= targetGrade,
      maxPossibleGrade: rounded,
    });

    return {
      isFullyGraded: true,
      finalGrade: rounded,
      finalMention: mention,
      filledVariables,
      pendingVariables: [],
      maxPossibleGrade: rounded,
      minGuaranteedGrade: rounded,
      requirements: {
        MM: dummyReq("MM", 5.0, "Aprovação (MM - 5.0)"),
        MS: dummyReq("MS", 7.0, "Médio Superior (MS - 7.0)"),
        SS: dummyReq("SS", 9.0, "Superior (SS - 9.0)"),
      },
    };
  }

  // Com variáveis pendentes: avalia os cenários extremos (tirando 0.0 vs tirando 10.0)
  const zerosScenario: Record<string, number> = { ...cleanGrades };
  const tensScenario: Record<string, number> = { ...cleanGrades };
  for (const p of pendingVariables) {
    zerosScenario[p] = 0.0;
    tensScenario[p] = 10.0;
  }

  const minGuaranteed = evaluateFormula(formulaStr, zerosScenario) ?? 0;
  const maxPossible = evaluateFormula(formulaStr, tensScenario) ?? 10;

  const solveForTarget = (targetGrade: number, mention: UnbMention, label: string): TargetRequirement => {
    // 1. Já atingiu mesmo tirando 0 em todas as restantes?
    if (minGuaranteed >= targetGrade) {
      return {
        targetMention: mention,
        targetGrade,
        label,
        requiredGrade: 0.0,
        isAlreadyAchieved: true,
        isAchievable: true,
        maxPossibleGrade: Math.round(maxPossible * 100) / 100,
      };
    }

    // 2. É impossível mesmo tirando 10 em todas as restantes?
    if (maxPossible < targetGrade) {
      return {
        targetMention: mention,
        targetGrade,
        label,
        requiredGrade: null,
        isAlreadyAchieved: false,
        isAchievable: false,
        maxPossibleGrade: Math.round(maxPossible * 100) / 100,
      };
    }

    // 3. Busca binária pela nota uniforme x necessária nas pendentes para f(x) >= targetGrade
    let low = 0.0;
    let high = 10.0;
    for (let iter = 0; iter < 25; iter++) {
      const mid = (low + high) / 2;
      const testScenario = { ...cleanGrades };
      for (const p of pendingVariables) {
        testScenario[p] = mid;
      }
      const res = evaluateFormula(formulaStr, testScenario);
      if (res !== null && res >= targetGrade) {
        high = mid;
      } else {
        low = mid;
      }
    }

    const roundedRequired = Math.round(high * 100) / 100;

    return {
      targetMention: mention,
      targetGrade,
      label,
      requiredGrade: roundedRequired,
      isAlreadyAchieved: false,
      isAchievable: true,
      maxPossibleGrade: Math.round(maxPossible * 100) / 100,
    };
  };

  return {
    isFullyGraded: false,
    finalGrade: null,
    finalMention: null,
    filledVariables,
    pendingVariables,
    maxPossibleGrade: Math.round(maxPossible * 100) / 100,
    minGuaranteedGrade: Math.round(minGuaranteed * 100) / 100,
    requirements: {
      MM: solveForTarget(5.0, "MM", "Aprovação (MM - 5.0)"),
      MS: solveForTarget(7.0, "MS", "Médio Superior (MS - 7.0)"),
      SS: solveForTarget(9.0, "SS", "Superior (SS - 9.0)"),
    },
  };
}

/**
 * Presets comuns de fórmulas de avaliação da UnB.
 */
export interface FormulaPreset {
  id: string;
  name: string;
  description: string;
  formula: string;
}

export const COMMON_UNB_FORMULA_PRESETS: FormulaPreset[] = [
  {
    id: "2-provas",
    name: "2 Provas (Média Simples)",
    description: "Duas provas com o mesmo peso",
    formula: "(P1 + P2) / 2",
  },
  {
    id: "3-provas",
    name: "3 Provas (Média Simples)",
    description: "Três provas com o mesmo peso",
    formula: "(P1 + P2 + P3) / 3",
  },
  {
    id: "pesos-40-60",
    name: "Ponderada 40% / 60%",
    description: "P1 com peso 4 e P2 com peso 6",
    formula: "0.4 * P1 + 0.6 * P2",
  },
  {
    id: "2p-trabalho",
    name: "2 Provas + Trabalho (40/40/20)",
    description: "Duas provas de 40% e um trabalho/projeto de 20%",
    formula: "0.4 * P1 + 0.4 * P2 + 0.2 * T",
  },
  {
    id: "pesos-2-3-2",
    name: "Pesos 2, 3 e 2",
    description: "Três provas com pesos 2, 3 e 2",
    formula: "(2 * P1 + 3 * P2 + 2 * P3) / 7",
  },
  {
    id: "provas-listas",
    name: "Provas (70%) + Listas (30%)",
    description: "Média de duas provas (70%) e listas de exercícios (30%)",
    formula: "((P1 + P2) / 2) * 0.7 + L * 0.3",
  },
];
