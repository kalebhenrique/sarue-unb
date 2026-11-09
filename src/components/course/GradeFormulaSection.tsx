import React, { useState, useEffect, useMemo } from "react";
import { Alert, Card, Badge, Input, NumberInput } from "@/components/ui";
import {
  Calculator,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  X,
} from "lucide-react";
import {
  validateFormula,
  extractVariables,
  calculateApprovalRequirements,
  COMMON_UNB_FORMULA_PRESETS,
} from "@/core";
import type { Discipline, CalculationResult } from "@/core";

interface GradeFormulaSectionProps {
  discipline: Discipline;
  /** Quando embutido dentro de outro Card (evita sombras empilhadas) */
  embedded?: boolean;
  /** Notifica o componente pai sobre a badge de resumo calculada (para exibição no topo do Card) */
  onSummaryChange?: (badge: React.ReactNode) => void;
}

const formatGrade = (val: number, decimals: number = 1): string => {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
};

export const GradeFormulaSection: React.FC<GradeFormulaSectionProps> = ({
  discipline,
  embedded = false,
  onSummaryChange,
}) => {
  const storagePrefix = `sarue:discipline_grades:${discipline.id}`;
  const formulaStorageKey = `${storagePrefix}:formula`;
  const valuesStorageKey = `${storagePrefix}:values`;
  const expandedStorageKey = `${storagePrefix}:expanded`;

  // Fórmula matemática
  const [formula, setFormula] = useState<string>(() => {
    return localStorage.getItem(formulaStorageKey) || "(P1 + P2) / 2";
  });

  // Notas informadas por variável: { P1: 7.5, P2: null }
  const [grades, setGrades] = useState<Record<string, number | null>>(() => {
    try {
      const saved = localStorage.getItem(valuesStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Estado de expansão da seção
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem(expandedStorageKey);
    // Expandido por padrão se não houver preferência anterior
    return saved !== null ? saved === "true" : true;
  });

  // Salva fórmula no localStorage
  useEffect(() => {
    localStorage.setItem(formulaStorageKey, formula);
  }, [formulaStorageKey, formula]);

  // Salva notas no localStorage
  useEffect(() => {
    localStorage.setItem(valuesStorageKey, JSON.stringify(grades));
  }, [valuesStorageKey, grades]);

  // Salva estado de expansão
  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(expandedStorageKey, String(next));
      return next;
    });
  };

  // Validação e cálculo
  const validation = useMemo(() => validateFormula(formula), [formula]);
  const variables = useMemo(() => extractVariables(formula), [formula]);

  const calculation: CalculationResult | null = useMemo(() => {
    if (!validation.isValid) return null;
    return calculateApprovalRequirements(formula, grades);
  }, [formula, grades, validation.isValid]);

  const handleGradeChange = (variable: string, val: number | null) => {
    if (val === null || val === undefined || isNaN(val)) {
      setGrades((prev) => ({ ...prev, [variable]: null }));
      return;
    }

    // Limita de 0 a 10 com arredondamento em 2 casas decimais
    const clamped = Math.max(0, Math.min(10, Math.round(val * 100) / 100));
    setGrades((prev) => ({ ...prev, [variable]: clamped }));
  };

  const handleResetGrades = () => {
    setGrades({});
  };

  const handleApplyPreset = (presetFormula: string) => {
    setFormula(presetFormula);
  };

  // Resumo para o cabeçalho (visível mesmo colapsado)
  const headerSummaryBadge = useMemo(() => {
    if (!validation.isValid) {
      return (
        <Badge variant="urgent" size="sm" className="font-black">
          Fórmula inválida
        </Badge>
      );
    }

    if (!calculation) return null;

    if (
      calculation.isFullyGraded &&
      calculation.finalGrade !== null &&
      calculation.finalMention
    ) {
      return (
        <Badge
          variant={calculation.finalMention.passed ? "success" : "urgent"}
          size="sm"
          className="font-black"
        >
          Média: {formatGrade(calculation.finalGrade, 1)} (
          {calculation.finalMention.mention}) —{" "}
          {calculation.finalMention.passed ? "Aprovado" : "Reprovado"}
        </Badge>
      );
    }

    const mmReq = calculation.requirements.MM;
    if (mmReq.isAlreadyAchieved) {
      return (
        <Badge variant="success" size="sm" className="font-black">
          Aprovação (MM) garantida!
        </Badge>
      );
    }

    if (!mmReq.isAchievable) {
      return (
        <Badge variant="urgent" size="sm" className="font-black">
          MM inatingível (Máx: {formatGrade(calculation.maxPossibleGrade, 1)})
        </Badge>
      );
    }

    if (mmReq.requiredGrade !== null) {
      return (
        <Badge variant="yellow" size="sm" className="font-black">
          {calculation.pendingVariables.length === 1
            ? `Precisa de ${formatGrade(mmReq.requiredGrade, 1)} na ${calculation.pendingVariables[0]} (MM)`
            : `Média de ${formatGrade(mmReq.requiredGrade, 1)} restante (MM)`}
        </Badge>
      );
    }

    return null;
  }, [validation.isValid, calculation]);

  useEffect(() => {
    onSummaryChange?.(headerSummaryBadge);
  }, [headerSummaryBadge, onSummaryChange]);

  const Container = embedded ? "div" : Card;
  const containerProps = embedded
    ? { className: "pt-3 pb-1 border-t-2 border-black/10" }
    : {
        className:
          "p-4 bg-paper rounded-lg border-2 border-ink shadow-(--neo-card-shadow)",
      };

  return (
    <Container {...containerProps}>
      {/* Topo / Cabeçalho da Seção com Chevron estilo sarue-unb-site */}
      <div
        onClick={toggleExpanded}
        className="flex items-center justify-between gap-3 cursor-pointer select-none group"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={
          isExpanded
            ? "Recolher calculadora de nota"
            : "Expandir calculadora de nota"
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-ink/10 border-2 border-ink flex items-center justify-center text-blue-ink shrink-0 group-hover:bg-blue-ink/20 transition-colors">
            <Calculator className="w-5 h-5 stroke-[2.5]" />
          </div>
          <h3 className="text-sm font-black text-black group-hover:text-blue-ink transition-colors">
            Calculadora de Nota
          </h3>
        </div>

        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream dark:bg-btn-raise text-black shadow-neo-xs group-hover:bg-neutral-100 dark:group-hover:bg-neutral-200 transition-colors">
          <ChevronDown
            className={`h-4 w-4 stroke-[2.5] transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </span>
      </div>

      {/* Conteúdo Expandido com animação suave (0fr -> 1fr) */}
      <div
        className={`grid transition-[grid-template-rows] duration-150 ease-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!isExpanded}
        inert={!isExpanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pb-2 pl-4 sm:pl-12 pr-1.5 mt-3 space-y-5">
            {/* Seletor de Presets Rápidos */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-black">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 stroke-[2.5]" />
                <span>Modelos Frequentes da UnB:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_UNB_FORMULA_PRESETS.map((preset) => {
                  const isSelected = formula.trim() === preset.formula.trim();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset.formula)}
                      title={preset.description}
                      className={`text-xs px-3 py-1 rounded-xl font-bold border-2 border-ink transition-colors duration-150 cursor-pointer ${
                        isSelected
                          ? "bg-neo-blue text-white font-black"
                          : "bg-paper dark:bg-btn-raise text-black hover:bg-neutral-100 dark:hover:bg-neutral-200"
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campo da Fórmula de Avaliação */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="discipline-formula-input"
                  className="font-black text-black"
                >
                  Fórmula de Avaliação:
                </label>
                {validation.isValid ? (
                  <span className="text-[11px] font-bold text-ink-success flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    Fórmula válida ({variables.length}{" "}
                    {variables.length === 1 ? "avaliação" : "avaliações"})
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-ink-error flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                    {validation.error || "Fórmula inválida"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    id="discipline-formula-input"
                    value={formula}
                    onChange={(e) => setFormula(e.target.value)}
                    placeholder="Ex.: (P1 + P2 + P3) / 3 ou 0.4*P1 + 0.6*P2"
                    className="font-mono text-sm font-bold"
                  />
                </div>
              </div>

              <p className="flex text-xs text-neutral-600 font-semibold items-center gap-1">
                <Info className="w-3 h-3 stroke-2 shrink-0 text-blue-ink" />
                Use letras para os nomes das provas/trabalhos (ex: P1, P2, T).
                Operadores permitidos: +, -, *, /, ( ).
              </p>
            </div>

            {/* Grade de Lançamento de Notas das Variáveis Detectadas */}
            {variables.length > 0 && validation.isValid && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-black">
                    Notas Obtidas:
                  </span>
                  {Object.keys(grades).some(
                    (k) => grades[k] !== null && grades[k] !== undefined,
                  ) && (
                    <button
                      type="button"
                      onClick={handleResetGrades}
                      className="text-xs font-bold text-neutral-500 hover:text-ink-error underline cursor-pointer inline-flex items-center gap-1"
                    >
                      <span>Limpar notas lançadas</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
                  {variables.map((variable) => {
                    const val = grades[variable];
                    const hasValue = val !== undefined && val !== null;

                    return (
                      <div
                        key={variable}
                        className={`p-3 rounded-xl border-2 border-ink transition-colors ${
                          hasValue
                            ? "bg-pastel-blue text-black"
                            : "bg-paper text-black"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span className="font-black text-xs text-black uppercase tracking-wider">
                            {variable}
                          </span>
                          {hasValue && (
                            <button
                              type="button"
                              onClick={() =>
                                setGrades((prev) => ({
                                  ...prev,
                                  [variable]: null,
                                }))
                              }
                              className="text-xs font-black text-neutral-500 hover:text-ink-error cursor-pointer p-1 leading-none"
                              title="Limpar nota"
                              aria-label={`Limpar nota de ${variable}`}
                            >
                              <X className="size-3 " />
                            </button>
                          )}
                        </div>

                        <NumberInput
                          min={0}
                          max={10}
                          step={0.5}
                          smallStep={0.1}
                          placeholder="Pendente"
                          value={hasValue ? val : null}
                          onValueChange={(newVal) =>
                            handleGradeChange(variable, newVal)
                          }
                          aria-label={`Nota da avaliação ${variable}`}
                          controls="stacked"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Painel de Resultados & Estimativas para Aprovação */}
            {calculation && validation.isValid && (
              <div className="space-y-2.5 pt-1">
                {/* Caso 1: Todas as notas já foram preenchidas */}
                {calculation.isFullyGraded &&
                  calculation.finalGrade !== null &&
                  calculation.finalMention && (
                    <Alert
                      variant={
                        calculation.finalMention.passed
                          ? "green"
                          : "destructive"
                      }
                      title={`Nota Final: ${formatGrade(calculation.finalGrade, 2)} (${calculation.finalMention.mention} — ${calculation.finalMention.label})`}
                      description={
                        calculation.finalMention.passed
                          ? "Aprovado na disciplina."
                          : "Reprovado na disciplina."
                      }
                    />
                  )}

                {/* Caso 2: Avaliações ainda pendentes -> Estimativa concisa */}
                {!calculation.isFullyGraded && (
                  <div className="space-y-2.5">
                    {calculation.requirements.MM.isAlreadyAchieved ? (
                      <Alert
                        variant="green"
                        className="shadow-none"
                        title="Aprovação garantida (Menção MM ≥ 5,0)"
                        description={`Nota acumulada já garante aprovação mesmo zerando ${calculation.pendingVariables.join(", ")}.`}
                      />
                    ) : calculation.requirements.MM.isAchievable ? (
                      <Alert
                        variant="yellow"
                        className="shadow-none"
                        title={`Nota restante para aprovação (MM ≥ 5,0): ${formatGrade(calculation.requirements.MM.requiredGrade ?? 0, 2)}`}
                        description={
                          calculation.pendingVariables.length === 1
                            ? `Necessário tirar no mínimo ${formatGrade(calculation.requirements.MM.requiredGrade ?? 0, 2)} em ${calculation.pendingVariables[0]}.`
                            : `Média mínima necessária nas avaliações pendentes (${calculation.pendingVariables.join(", ")}).`
                        }
                      />
                    ) : (
                      <Alert
                        variant="destructive"
                        className="shadow-none"
                        title={`Aprovação em risco (Máx. possível: ${formatGrade(calculation.maxPossibleGrade, 2)})`}
                        description="Mesmo tirando 10,0 nas avaliações restantes, a média não atinge 5,0 (MM)."
                      />
                    )}

                    {/* Metas Superiores: MS (7.0) e SS (9.0) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      {(
                        [
                          {
                            key: "MS",
                            label: "Meta MS (≥ 7,0)",
                            req: calculation.requirements.MS,
                          },
                          {
                            key: "SS",
                            label: "Meta SS (≥ 9,0)",
                            req: calculation.requirements.SS,
                          },
                        ] as const
                      ).map(({ key, label, req }) => (
                        <div
                          key={key}
                          className="px-3.5 py-2.5 rounded-xl border-2 border-ink bg-paper text-black flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-neutral-700">
                            {label}:
                          </span>
                          <div className="font-black shrink-0">
                            {req.isAlreadyAchieved ? (
                              <Badge
                                variant="success"
                                size="sm"
                                className="font-black"
                              >
                                Garantido
                              </Badge>
                            ) : req.isAchievable &&
                              req.requiredGrade !== null ? (
                              <Badge
                                variant="primary"
                                size="sm"
                                className="font-black"
                              >
                                Falta {formatGrade(req.requiredGrade, 2)}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                size="sm"
                                className="font-bold text-neutral-500"
                              >
                                Inatingível
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
};
