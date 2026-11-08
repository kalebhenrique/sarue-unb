import { describe, it, expect } from "vitest";
import {
  normalizeDecimalSeparator,
  parseGradeInput,
} from "@/components/ui/number-field";

describe("NumberInput pt-BR Locale & Decimal Normalization (B1/B2)", () => {
  it("normaliza strings com ponto para vírgula no separador decimal", () => {
    expect(normalizeDecimalSeparator("7.5")).toBe("7,5");
    expect(normalizeDecimalSeparator("10.0")).toBe("10,0");
    expect(normalizeDecimalSeparator("0.5")).toBe("0,5");
    expect(normalizeDecimalSeparator("7,5")).toBe("7,5");
  });

  it("parseGradeInput aceita tanto vírgula quanto ponto como separador decimal sem corrupção", () => {
    expect(parseGradeInput("7.5")).toBe(7.5);
    expect(parseGradeInput("7,5")).toBe(7.5);
    expect(parseGradeInput("0.5")).toBe(0.5);
    expect(parseGradeInput("0,5")).toBe(0.5);
    expect(parseGradeInput("10.0")).toBe(10);
    expect(parseGradeInput("10,0")).toBe(10);
    expect(parseGradeInput("9.85")).toBe(9.85);
    expect(parseGradeInput("9,85")).toBe(9.85);
  });

  it("parseGradeInput lida com entradas vazias, nulas e inválidas", () => {
    expect(parseGradeInput("")).toBeNull();
    expect(parseGradeInput("   ")).toBeNull();
    expect(parseGradeInput(null)).toBeNull();
    expect(parseGradeInput(undefined)).toBeNull();
    expect(parseGradeInput(7.5)).toBe(7.5);
    expect(parseGradeInput("abc")).toBeNull();
  });

  it("formata notas no padrão brasileiro pt-BR com vírgula", () => {
    const formatter1Dec = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const formatter2Dec = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    expect(formatter1Dec.format(7.5)).toBe("7,5");
    expect(formatter1Dec.format(10.0)).toBe("10,0");
    expect(formatter2Dec.format(7.5)).toBe("7,50");
    expect(formatter2Dec.format(9.85)).toBe("9,85");
  });
});
