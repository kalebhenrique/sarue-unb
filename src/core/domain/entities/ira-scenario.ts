// Entidades da Calculadora de IRA — cenário editável derivado do histórico.
// O cenário é uma cópia mutável do histórico acadêmico: o aluno edita menções
// passadas ("e se tivesse sido MS?") e monta semestres futuros ("se fechar com SS...").

/**
 * Menções da UnB e seus pesos oficiais na fórmula do IRA (escala 0–5).
 * SS=5, MS=4, MM=3, MI=2, II=1, SR=0.
 */
export type IraMention = 'SS' | 'MS' | 'MM' | 'MI' | 'II' | 'SR';

export const IRA_MENTION_VALUES: Record<IraMention, number> = {
  SS: 5,
  MS: 4,
  MM: 3,
  MI: 2,
  II: 1,
  SR: 0,
};

/** Ordem canônica de exibição das menções (da melhor para a pior). */
export const IRA_MENTIONS: IraMention[] = ['SS', 'MS', 'MM', 'MI', 'II', 'SR'];

export const IRA_MENTION_DESCRIPTIONS: Record<IraMention, string> = {
  SS: 'Excelente',
  MS: 'Muito bom',
  MM: 'Médio',
  MI: 'Insuficiente',
  II: 'Inferior',
  SR: 'Sem rendimento',
};

/** Natureza de uma disciplina no cenário, resolvida pela matriz do currículo. */
export type IraDisciplineNature = 'Obrigatória' | 'Optativa' | 'Complementar';

/** Uma linha editável da calculadora (equivale a uma linha do IRA.xlsx). */
export interface IraScenarioDiscipline {
  /** Identificador estável: código para linhas do histórico, id gerado para adicionadas. */
  id: string;
  code?: string;
  name: string;
  /** Créditos da disciplina (carga horária ÷ 15 na UnB). */
  credits: number;
  /** Carga horária original, quando veio do histórico/currículo. */
  workloadHours?: number;
  /** Menção atual da linha; null = sem menção (ex.: cursando agora, previsto pelo usuário). */
  mention: IraMention | null;
  nature?: IraDisciplineNature;
  /** 'history' = veio do histórico; 'added' = criada pelo aluno na calculadora. */
  origin: 'history' | 'added';
}

export type IraScenarioSemesterKind = 'history' | 'unknown' | 'current' | 'future';

export interface IraScenarioSemester {
  id: string;
  /** Rótulo exibido: "1º Semestre", "Semestre não identificado", "Cursando agora", "Próximo semestre"... */
  label: string;
  /** Período letivo no formato do SIGAA (ex.: "2020.1"), quando conhecido. */
  period?: string;
  kind: IraScenarioSemesterKind;
  disciplines: IraScenarioDiscipline[];
}

/**
 * O cenário completo da calculadora. Disciplinas trancadas não viram linhas
 * (como no IRA.xlsx: "essas disciplinas não devem aparecer nos quadros") —
 * entram só como contadores que penalizam o IRA.
 */
export interface IraScenario {
  semesters: IraScenarioSemester[];
  /** Trancadas (situação TR) obrigatórias detectadas no histórico. */
  baseTrancadasObrigatorias: number;
  /** Trancadas (situação TR) optativas/complementares detectadas no histórico. */
  baseTrancadasOptativas: number;
  /** Trancamentos extras simulados pelo aluno (ex.: trancar no semestre futuro). */
  extraTrancadasObrigatorias: number;
  extraTrancadasOptativas: number;
  /**
   * Assinatura do perfil que gerou o cenário (conteúdo do histórico). Se o
   * perfil mudar (nova sincronização), o cenário salvo é descartado e o
   * cenário real é reconstruído — menções novas entram automaticamente.
   */
  profileSignature?: string;
  updatedAt: string;
}

/** Limite de linhas por semestre na grade da calculadora. */
export const MAX_DISCIPLINES_PER_SEMESTER = 10;

/** Limite de semestres futuros que o aluno pode planejar na calculadora. */
export const MAX_FUTURE_SEMESTERS = 8;
