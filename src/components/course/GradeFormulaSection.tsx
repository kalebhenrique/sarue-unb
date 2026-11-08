import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  Badge,
  Button,
  Input,
  NumberInput,
} from "@/components/ui";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Target,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
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

    if (calculation.isFullyGraded && calculation.finalGrade !== null && calculation.finalMention) {
      return (
        <Badge
          variant={calculation.finalMention.passed ? "success" : "urgent"}
          size="sm"
          className="font-black"
        >
          Média: {formatGrade(calculation.finalGrade, 1)} ({calculation.finalMention.mention}) —{" "}
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

  const Container = embedded ? "div" : Card;
  const containerProps = embedded
    ? { className: "pt-4 pb-3 border-t-2 border-black/10 space-y-4" }
    : { className: "p-4 bg-paper rounded-lg border-2 border-ink shadow-(--neo-card-shadow) space-y-4" };

  return (
    <Container {...containerProps}>
      {/* Topo / Cabeçalho da Seção com Botão de Expansão */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          onClick={toggleExpanded}
          className="flex items-center gap-3 cursor-pointer select-none group"
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleExpanded();
            }
          }}
        >
          <div className="w-9 h-9 rounded-xl bg-blue-ink/10 border-2 border-ink flex items-center justify-center text-blue-ink shrink-0 group-hover:bg-blue-ink/20 transition-colors">
            <Calculator className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-black group-hover:text-blue-ink transition-colors">
                Calculadora de Nota
              </h3>
              {headerSummaryBadge}
            </div>
            <p className="text-xs text-neutral-600 font-medium">
              Calcule a menção final (UnB) e veja a nota restante necessária para aprovação (MM ≥ 5.0).
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleExpanded}
          className="cursor-pointer font-bold flex items-center gap-1.5"
          aria-label={isExpanded ? "Recolher calculadora de nota" : "Expandir calculadora de nota"}
        >
          <span>{isExpanded ? "Ocultar" : "Configurar"}</span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
          )}
        </Button>
      </div>

      {/* Conteúdo Expandido */}
      {isExpanded && (
        <div className="pt-3 pb-3 border-t-2 border-ink/10 space-y-4">
          {/* Seletor de Presets Rápidos */}
          <div className="space-y-1.5">
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
                    className={`text-xs px-3 py-1 rounded-xl font-bold border-2 border-ink transition-[transform,box-shadow,background-color] duration-150 cursor-pointer ${
                      isSelected
                        ? "bg-neo-blue text-white shadow-neo-xs font-black"
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
              <label htmlFor="discipline-formula-input" className="font-black text-black">
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

            <p className="text-[11px] text-neutral-600 font-medium flex items-center gap-1">
              <Info className="w-3 h-3 stroke-[2] shrink-0 text-blue-ink" />
              Use letras para os nomes das provas/trabalhos (ex: P1, P2, T). Operadores permitidos: +, -, *, /, ( ).
            </p>
          </div>

          {/* Grade de Lançamento de Notas das Variáveis Detectadas */}
          {variables.length > 0 && validation.isValid && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-black">
                  Notas Obtidas (deixe em branco se a avaliação for futura/pendente):
                </span>
                {Object.keys(grades).some((k) => grades[k] !== null && grades[k] !== undefined) && (
                  <button
                    type="button"
                    onClick={handleResetGrades}
                    className="text-[11px] font-bold text-neutral-500 hover:text-ink-error underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 stroke-[2.5]" />
                    <span>Limpar notas lançadas</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {variables.map((variable) => {
                  const val = grades[variable];
                  const hasValue = val !== undefined && val !== null;

                  return (
                    <div
                      key={variable}
                      className={`p-3 rounded-xl border-2 border-ink transition-all shadow-neo-xs ${
                        hasValue
                          ? "bg-pastel-blue text-black"
                          : "bg-paper text-black"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-black text-xs text-black uppercase tracking-wider">
                          {variable}
                        </span>
                        {hasValue && (
                          <button
                            type="button"
                            onClick={() =>
                              setGrades((prev) => ({ ...prev, [variable]: null }))
                            }
                            className="text-xs font-black text-neutral-500 hover:text-ink-error cursor-pointer px-1 leading-none"
                            title="Limpar nota"
                            aria-label={`Limpar nota de ${variable}`}
                          >
                            ✕
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
                        onValueChange={(newVal) => handleGradeChange(variable, newVal)}
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
            <div className="space-y-3 pt-2">
              {/* Caso 1: Todas as notas já foram preenchidas */}
              {calculation.isFullyGraded && calculation.finalGrade !== null && calculation.finalMention && (
                <div
                  className={`p-4 rounded-xl border-2 border-ink shadow-neo-sm ${
                    calculation.finalMention.passed
                      ? "bg-pastel-green dark:bg-paper dark:border-l-[6px] dark:border-l-neo-green text-black"
                      : "bg-pastel-red dark:bg-paper dark:border-l-[6px] dark:border-l-neo-danger text-black"
                  } flex flex-wrap items-center justify-between gap-3`}
                >
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-neutral-700 block">
                      Nota Final Calculada
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-3xl font-black text-black font-mono">
                        {formatGrade(calculation.finalGrade, 2)}
                      </span>
                      <Badge
                        variant={calculation.finalMention.passed ? "success" : "urgent"}
                        size="md"
                        className="font-black text-xs"
                      >
                        {calculation.finalMention.mention} — {calculation.finalMention.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span
                      className={`text-sm font-black flex items-center gap-1.5 ${
                        calculation.finalMention.passed
                          ? "text-ink-success"
                          : "text-ink-error"
                      }`}
                    >
                      {calculation.finalMention.passed ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                          <span>Aprovado na Disciplina</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
                          <span>Reprovado por Nota (Abaixo de 5,0 - MM)</span>
                        </>
                      )}
                    </span>
                    <p className="text-[11px] text-neutral-600 font-medium mt-0.5">
                      Critério regimental da UnB: aprovação com menção MM, MS ou SS.
                    </p>
                  </div>
                </div>
              )}

              {/* Caso 2: Avaliações ainda pendentes -> Estimativa de Nota Restante */}
              {!calculation.isFullyGraded && (
                <div className="space-y-2.5">
                  {/* Card Principal: Meta de Aprovação (MM - 5.0) */}
                  {calculation.requirements.MM.isAlreadyAchieved ? (
                    <div className="p-4 rounded-xl border-2 border-ink shadow-neo-sm bg-pastel-green dark:bg-paper dark:border-l-[6px] dark:border-l-neo-green text-black flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-neo-green/20 border-2 border-ink flex items-center justify-center text-ink-success shrink-0 mt-0.5">
                        <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-black">
                          Aprovação Garantida (Menção MM)!
                        </h4>
                        <p className="text-xs font-bold text-neutral-700 mt-1">
                          Parabéns! Mesmo se você tirar zero em todas as avaliações restantes (
                          {calculation.pendingVariables.join(", ")}), sua nota acumulada já é suficiente para ser aprovado na UnB.
                        </p>
                      </div>
                    </div>
                  ) : calculation.requirements.MM.isAchievable ? (
                    <div className="p-4 rounded-xl border-2 border-ink shadow-neo-sm bg-pastel-yellow dark:bg-paper dark:border-l-[6px] dark:border-l-neo-yellow text-black flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-neo-yellow/30 border-2 border-ink flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
                        <Target className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-black text-black">
                            Nota Restante para Aprovação (MM ≥ 5,0):
                          </h4>
                          <span className="text-base font-black font-mono px-2.5 py-0.5 bg-neo-yellow text-ink border-2 border-ink rounded-lg shadow-neo-xs">
                            {formatGrade(calculation.requirements.MM.requiredGrade ?? 0, 2)}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-neutral-800">
                          {calculation.pendingVariables.length === 1 ? (
                            <>
                              Você precisa tirar no mínimo{" "}
                              <span className="font-black underline text-black">
                                {formatGrade(calculation.requirements.MM.requiredGrade ?? 0, 2)}
                              </span>{" "}
                              na avaliação <strong>{calculation.pendingVariables[0]}</strong> para fechar com menção MM (Aprovado).
                            </>
                          ) : (
                            <>
                              Você precisa de uma média de no mínimo{" "}
                              <span className="font-black underline text-black">
                                {formatGrade(calculation.requirements.MM.requiredGrade ?? 0, 2)}
                              </span>{" "}
                              nas avaliações pendentes (
                              {calculation.pendingVariables.join(", ")}) para ser aprovado.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border-2 border-ink shadow-neo-sm bg-pastel-red dark:bg-paper dark:border-l-[6px] dark:border-l-neo-danger text-black flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-neo-danger/20 border-2 border-ink flex items-center justify-center text-ink-error shrink-0 mt-0.5">
                        <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-black">
                          Atenção: Aprovação em Risco
                        </h4>
                        <p className="text-xs font-bold text-neutral-800 mt-1">
                          Mesmo tirando nota máxima 10,0 em todas as avaliações restantes, a nota final máxima atingível é{" "}
                          <strong className="underline text-black font-black">
                            {formatGrade(calculation.maxPossibleGrade, 2)}
                          </strong>{" "}
                          (abaixo do mínimo de 5,0 para MM). Verifique com o docente sobre provas de reposição ou trabalhos extras.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Metas Superiores: MS (7.0) e SS (9.0) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {/* Meta MS */}
                    <div className="p-3 rounded-xl border-2 border-ink bg-paper text-black shadow-neo-xs flex items-center justify-between">
                      <span className="font-bold text-neutral-700">Meta MS (Médio Superior ≥ 7,0):</span>
                      <div className="font-mono font-black">
                        {calculation.requirements.MS.isAlreadyAchieved ? (
                          <Badge variant="success" size="sm" className="font-black">
                            ✓ Garantido!
                          </Badge>
                        ) : calculation.requirements.MS.isAchievable &&
                          calculation.requirements.MS.requiredGrade !== null ? (
                          <Badge variant="primary" size="sm" className="font-black">
                            Falta {formatGrade(calculation.requirements.MS.requiredGrade, 2)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" size="sm" className="font-bold text-neutral-500">
                            Inatingível
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Meta SS */}
                    <div className="p-3 rounded-xl border-2 border-ink bg-paper text-black shadow-neo-xs flex items-center justify-between">
                      <span className="font-bold text-neutral-700">Meta SS (Superior ≥ 9,0):</span>
                      <div className="font-mono font-black">
                        {calculation.requirements.SS.isAlreadyAchieved ? (
                          <Badge variant="success" size="sm" className="font-black">
                            ✓ Garantido!
                          </Badge>
                        ) : calculation.requirements.SS.isAchievable &&
                          calculation.requirements.SS.requiredGrade !== null ? (
                          <Badge variant="primary" size="sm" className="font-black">
                            Falta {formatGrade(calculation.requirements.SS.requiredGrade, 2)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" size="sm" className="font-bold text-neutral-500">
                            Inatingível
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Container>
  );
};
