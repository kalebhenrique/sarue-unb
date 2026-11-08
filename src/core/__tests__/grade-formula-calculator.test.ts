import { describe, it, expect } from "vitest";
import {
  validateFormula,
  extractVariables,
  evaluateFormula,
  getUnbMention,
  calculateApprovalRequirements,
} from "../domain/utils/grade-formula-calculator";

describe("Grade Formula Calculator", () => {
  describe("validateFormula", () => {
    it("valida fórmulas aritméticas simples e ponderadas", () => {
      expect(validateFormula("(P1 + P2) / 2").isValid).toBe(true);
      expect(validateFormula("0.4 * P1 + 0.6 * P2").isValid).toBe(true);
      expect(validateFormula("0,4 * P1 + 0,6 * P2").isValid).toBe(true);
      expect(validateFormula("(2 * P1 + 3 * P2 + 2 * P3) / 7").isValid).toBe(true);
      expect(validateFormula("((P1 + P2) / 2) * 0.7 + L * 0.3").isValid).toBe(true);
    });

    it("detecta erros de sintaxe", () => {
      expect(validateFormula("").isValid).toBe(false);
      expect(validateFormula("   ").isValid).toBe(false);
      expect(validateFormula("(P1 + P2").isValid).toBe(false);
      expect(validateFormula("P1 + + P2").isValid).toBe(false);
      expect(validateFormula("P1 * / P2").isValid).toBe(false);
      expect(validateFormula("P1 @ P2").isValid).toBe(false);
    });
  });

  describe("extractVariables", () => {
    it("extrai lista única de variáveis preservando a ordem", () => {
      expect(extractVariables("(P1 + P2 + P3) / 3")).toEqual(["P1", "P2", "P3"]);
      expect(extractVariables("0.4 * P1 + 0.4 * P2 + 0.2 * T")).toEqual(["P1", "P2", "T"]);
      expect(extractVariables("P1 * 0.5 + P1 * 0.5")).toEqual(["P1"]);
      expect(extractVariables("((P1 + P2) / 2) * 0.8 + Trabalho * 0.2")).toEqual(["P1", "P2", "Trabalho"]);
    });
  });

  describe("evaluateFormula", () => {
    it("avalia operações aritméticas com precedência correta", () => {
      expect(evaluateFormula("(P1 + P2) / 2", { P1: 6, P2: 8 })).toBe(7);
      expect(evaluateFormula("0.4 * P1 + 0.6 * P2", { P1: 5, P2: 10 })).toBe(8);
      expect(evaluateFormula("(2 * P1 + 3 * P2) / 5", { P1: 4, P2: 9 })).toBe(7);
    });

    it("retorna null para divisão por zero ou variáveis faltantes", () => {
      expect(evaluateFormula("P1 / 0", { P1: 10 })).toBeNull();
      expect(evaluateFormula("P1 + P2", { P1: 5 })).toBeNull();
    });
  });

  describe("getUnbMention", () => {
    it("mapeia notas para as menções oficiais da UnB", () => {
      expect(getUnbMention(9.5).mention).toBe("SS");
      expect(getUnbMention(9.0).mention).toBe("SS");
      expect(getUnbMention(8.9).mention).toBe("MS");
      expect(getUnbMention(7.0).mention).toBe("MS");
      expect(getUnbMention(6.5).mention).toBe("MM");
      expect(getUnbMention(5.0).mention).toBe("MM");
      expect(getUnbMention(5.0).passed).toBe(true);

      expect(getUnbMention(4.9).mention).toBe("MI");
      expect(getUnbMention(3.0).mention).toBe("MI");
      expect(getUnbMention(3.0).passed).toBe(false);

      expect(getUnbMention(2.5).mention).toBe("II");
      expect(getUnbMention(0.1).mention).toBe("II");
      expect(getUnbMention(0.0).mention).toBe("SR");
    });
  });

  describe("calculateApprovalRequirements", () => {
    it("quando todas as notas foram preenchidas, calcula a nota final e menção", () => {
      const res = calculateApprovalRequirements("(P1 + P2) / 2", {
        P1: 7.0,
        P2: 8.0,
      });

      expect(res).not.toBeNull();
      expect(res!.isFullyGraded).toBe(true);
      expect(res!.finalGrade).toBe(7.5);
      expect(res!.finalMention?.mention).toBe("MS");
      expect(res!.finalMention?.passed).toBe(true);
    });

    it("calcula a nota restante necessária na P2 para aprovação (MM >= 5.0)", () => {
      // (P1 + P2) / 2 >= 5.0 => P1 + P2 >= 10.0 => se P1 = 4.0, P2 precisa ser 6.0
      const res = calculateApprovalRequirements("(P1 + P2) / 2", {
        P1: 4.0,
        P2: null,
      });

      expect(res).not.toBeNull();
      expect(res!.isFullyGraded).toBe(false);
      expect(res!.pendingVariables).toEqual(["P2"]);
      expect(res!.requirements.MM.isAchievable).toBe(true);
      expect(res!.requirements.MM.isAlreadyAchieved).toBe(false);
      expect(res!.requirements.MM.requiredGrade).toBeCloseTo(6.0, 1);

      // E para MS (7.0): P2 precisaria de 10.0
      expect(res!.requirements.MS.requiredGrade).toBeCloseTo(10.0, 1);

      // E para SS (9.0): precisaria de 14.0 (impossível pois máx é 10.0)
      expect(res!.requirements.SS.isAchievable).toBe(false);
    });

    it("identifica quando o aluno já garantiu aprovação", () => {
      // 0.6 * P1 + 0.4 * P2. Se P1 = 9.0, então 0.6 * 9 = 5.4 >= 5.0 (mesmo com P2 = 0)
      const res = calculateApprovalRequirements("0.6 * P1 + 0.4 * P2", {
        P1: 9.0,
        P2: null,
      });

      expect(res).not.toBeNull();
      expect(res!.requirements.MM.isAlreadyAchieved).toBe(true);
      expect(res!.requirements.MM.requiredGrade).toBe(0.0);
    });

    it("identifica quando é matematicamente impossível ser aprovado", () => {
      // (P1 + P2) / 2. Se P1 = -1 ou fórmula ponderada extrema onde P1 tirou 0 e peso é grande:
      // 0.7 * P1 + 0.3 * P2. Se P1 = 2.0, max com P2=10 é 1.4 + 3.0 = 4.4 < 5.0
      const res = calculateApprovalRequirements("0.7 * P1 + 0.3 * P2", {
        P1: 2.0,
        P2: null,
      });

      expect(res).not.toBeNull();
      expect(res!.requirements.MM.isAchievable).toBe(false);
      expect(res!.requirements.MM.maxPossibleGrade).toBe(4.4);
    });

    it("calcula média necessária quando há múltiplas avaliações pendentes", () => {
      // (P1 + P2 + P3) / 3 >= 5.0 => P1 + P2 + P3 >= 15.
      // Se P1 = 5.0, então P2 + P3 precisa somar 10. Média necessária entre P2 e P3 = 5.0
      const res = calculateApprovalRequirements("(P1 + P2 + P3) / 3", {
        P1: 5.0,
        P2: null,
        P3: null,
      });

      expect(res).not.toBeNull();
      expect(res!.pendingVariables).toEqual(["P2", "P3"]);
      expect(res!.requirements.MM.requiredGrade).toBeCloseTo(5.0, 1);
    });
  });
});
