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
  DEFAULT_GRADE_FORMULA,
  getDisciplineGradeData,
  isDisciplineUserDataHydrated,
  loadDisciplineUserData,
  saveDisciplineGradeData,
  subscribeToDisciplineUserData,
} from "@/core";
import type { Discipline, CalculationResult } from "@/core";

interface GradeFormulaSectionProps {
  discipline: Discipline;
  /** Quando embutido dentro de outro Card (evita sombras empilhadas) */
  embedded?: boolean;
  /** Força expansão inicial/permanente e oculta o cabeçalho do acordeão (BottomSheet mobile) */
  forceExpanded?: boolean;
  hideHeader?: boolean;
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
  forceExpanded = false,
  hideHeader = false,
  onSummaryChange,
}) => {
  const expandedStorageKey = `sarue:discipline_grades:${discipline.id}:expanded`;

  // Fórmula matemática e notas hidratadas do cache local + SQLite (app_settings)
  const [formula, setFormulaState] = useState<string>(() => {
    return getDisciplineGradeData(discipline).formula || DEFAULT_GRADE_FORMULA;
  });

  // Notas informadas por variável: { P1: 7.5, P2: null }
  const [grades, setGradesState] = useState<Record<string, number | null>>(() => {
    return getDisciplineGradeData(discipline).values;
  });

  const dirtyRef = React.useRef(false);
  const pendingSaveRef = React.useRef<{
    discipline: Discipline;
    formula: string;
    grades: Record<string, number | null>;
  } | null>(null);

  const flushPendingSave = React.useCallback(() => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    dirtyRef.current = false;
    void saveDisciplineGradeData(pending.discipline, {
      formula: pending.formula,
      values: pending.grades,
    });
  }, []);

  const setFormula = React.useCallback(
    (next: React.SetStateAction<string>) => {
      dirtyRef.current = true;
      setFormulaState(next);
    },
    [],
  );

  const setGrades = React.useCallback(
    (next: React.SetStateAction<Record<string, number | null>>) => {
      dirtyRef.current = true;
      setGradesState(next);
    },
    [],
  );

  // Recarrega estado ao trocar de disciplina (fazendo flush de edição pendente antes)
  useEffect(() => {
    flushPendingSave();
    dirtyRef.current = false;
    const initial = getDisciplineGradeData(discipline);
    setFormulaState(initial.formula || DEFAULT_GRADE_FORMULA);
    setGradesState(initial.values);
  }, [discipline, flushPendingSave]);

  // Hidrata do SQLite assim que disponível (sem sobrescrever edições em curso)
  useEffect(() => {
    const syncFromStore = () => {
      if (dirtyRef.current) return;
      const stored = getDisciplineGradeData(discipline);
      if (stored.found) {
        setFormulaState(stored.formula || DEFAULT_GRADE_FORMULA);
        setGradesState(stored.values);
      }
    };
    const unsubscribe = subscribeToDisciplineUserData(syncFromStore);
    if (!isDisciplineUserDataHydrated()) {
      void loadDisciplineUserData();
    }
    return unsubscribe;
  }, [discipline]);

  // Estado de expansão da seção
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(expandedStorageKey);
      // Expandido por padrão se não houver preferência anterior
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const [isFormulaFocused, setIsFormulaFocused] = useState(false);

  // Persiste fórmula e notas no SQLite + localStorage apenas quando houve edição do usuário
  useEffect(() => {
    if (!dirtyRef.current) return;
    pendingSaveRef.current = { discipline, formula, grades };
    const timer = window.setTimeout(() => {
      flushPendingSave();
    }, 200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [discipline, formula, grades, flushPendingSave]);

  // Garante flush imediato ao desmontar se houver edição pendente
  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [flushPendingSave]);

  // Salva estado de expansão
  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(expandedStorageKey, String(next));
      } catch {}
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

  const lastValidRef = React.useRef<{
    variables: string[];
    calculation: CalculationResult | null;
  }>({ variables: [], calculation: null });
  if (validation.isValid) {
    lastValidRef.current = { variables, calculation };
  }
  const isFormulaInvalid = !validation.isValid;
  const displayVariables = isFormulaInvalid
    ? lastValidRef.current.variables
    : variables;
  const displayCalculation = isFormulaInvalid
    ? lastValidRef.current.calculation
    : calculation;
  const pausedClassName = isFormulaInvalid
    ? "opacity-45 pointer-events-none transition-opacity duration-150"
    : "transition-opacity duration-150";

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

  const effectiveExpanded = forceExpanded || isExpanded;

  const Container = embedded ? "div" : Card;
  const containerProps = embedded
    ? {
        className: hideHeader
          ? "pt-1 pb-2"
          : "pt-3 pb-1 border-t-2 border-black/10",
      }
    : {
        className:
          "p-4 bg-paper rounded-lg border-2 border-ink shadow-(--neo-card-shadow)",
      };

  return (
    <Container {...containerProps}>
      {!hideHeader ? (
        /* Topo / Cabeçalho da Seção com Chevron estilo sarue-unb-site */
        <div
          onClick={toggleExpanded}
          className="flex items-center justify-between gap-3 cursor-pointer select-none group"
          role="button"
          tabIndex={0}
          aria-expanded={effectiveExpanded}
          aria-label={
            effectiveExpanded
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
            <div className="w-9 h-9 rounded-lg bg-sticker-blue border-2 border-ink flex items-center justify-center text-ink shrink-0">
              <Calculator className="w-5 h-5 stroke-[2.5]" />
            </div>
            <h3 className="text-sm font-black text-black group-hover:text-blue-ink transition-colors">
              Calculadora de Nota
            </h3>
          </div>

          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream dark:bg-btn-raise text-black shadow-neo-xs group-hover:bg-neutral-100 dark:group-hover:bg-neutral-200 transition-colors">
            <ChevronDown
              className={`h-4 w-4 stroke-[2.5] transition-transform duration-200 ${
                effectiveExpanded ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </span>
        </div>
      ) : null}

      {/* Conteúdo Expandido com animação suave (0fr -> 1fr) */}
      <div
        className={`grid transition-[grid-template-rows] duration-150 ease-out ${
          effectiveExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!effectiveExpanded}
        inert={!effectiveExpanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={
              hideHeader
                ? "pb-2 px-0.5 space-y-4"
                : "pb-2 pl-4 sm:pl-12 pr-1.5 mt-3 space-y-5"
            }
          >
            {/* Seletor de Presets Rápidos */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-black">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 stroke-[2.5]" />
                <span>Modelos Frequentes da UnB:</span>
              </div>
              <div className="flex flex-nowrap overflow-x-auto gap-2 pb-1 no-scrollbar">
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
                    onFocus={() => setIsFormulaFocused(true)}
                    onBlur={() => setIsFormulaFocused(false)}
                    placeholder="Ex.: (P1 + P2 + P3) / 3 ou 0.4*P1 + 0.6*P2"
                    className="font-mono text-sm font-bold"
                  />
                </div>
              </div>

              {isFormulaFocused && (
                <p className="flex text-xs text-neutral-600 font-semibold items-start gap-1">
                  <Info className="w-3 h-3 stroke-2 shrink-0 text-blue-ink mt-0.5" />
                  <span>
                    Use letras para os nomes das provas/trabalhos (ex: P1, P2,
                    T). Operadores permitidos: +, -, *, /, ( ).
                  </span>
                </p>
              )}
            </div>

            {displayVariables.length > 0 && (
              <div className={`space-y-2 ${pausedClassName}`}>
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
                  {displayVariables.map((variable) => {
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
                          controls="none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Painel de Resultados & Estimativas para Aprovação */}
            {displayCalculation && (
              <div className={`space-y-2.5 pt-1 ${pausedClassName}`}>
                {/* Caso 1: Todas as notas já foram preenchidas */}
                {displayCalculation.isFullyGraded &&
                  displayCalculation.finalGrade !== null &&
                  displayCalculation.finalMention && (
                    <Alert
                      variant={
                        displayCalculation.finalMention.passed
                          ? "green"
                          : "destructive"
                      }
                      title={`Nota Final: ${formatGrade(displayCalculation.finalGrade, 2)} (${displayCalculation.finalMention.mention} — ${displayCalculation.finalMention.label})`}
                      description={
                        displayCalculation.finalMention.passed
                          ? "Aprovado na disciplina."
                          : "Reprovado na disciplina."
                      }
                    />
                  )}

                {/* Caso 2: Avaliações ainda pendentes -> Estimativa concisa */}
                {!displayCalculation.isFullyGraded && (
                  <div className="space-y-2.5">
                    {displayCalculation.requirements.MM.isAlreadyAchieved ? (
                      <Alert
                        variant="green"
                        className="shadow-none"
                        title="Aprovação garantida (Menção MM ≥ 5,0)"
                        description={`Nota acumulada já garante aprovação mesmo zerando ${displayCalculation.pendingVariables.join(", ")}.`}
                      />
                    ) : displayCalculation.requirements.MM.isAchievable ? (
                      <Alert
                        variant="yellow"
                        className="shadow-none"
                        title={`Nota restante para aprovação (MM ≥ 5,0): ${formatGrade(displayCalculation.requirements.MM.requiredGrade ?? 0, 2)}`}
                        description={
                          displayCalculation.pendingVariables.length === 1
                            ? `Necessário tirar no mínimo ${formatGrade(displayCalculation.requirements.MM.requiredGrade ?? 0, 2)} em ${displayCalculation.pendingVariables[0]}.`
                            : `Média mínima necessária nas avaliações pendentes (${displayCalculation.pendingVariables.join(", ")}).`
                        }
                      />
                    ) : (
                      <Alert
                        variant="destructive"
                        className="shadow-none"
                        title={`Aprovação em risco (Máx. possível: ${formatGrade(displayCalculation.maxPossibleGrade, 2)})`}
                        description="Mesmo tirando 10,0 nas avaliações restantes, a média não atinge 5,0 (MM)."
                      />
                    )}

                    {/* Metas Superiores: MS (7.0) e SS (9.0) lado a lado */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {(
                        [
                          {
                            key: "MS",
                            label: "Meta MS (≥ 7,0)",
                            req: displayCalculation.requirements.MS,
                          },
                          {
                            key: "SS",
                            label: "Meta SS (≥ 9,0)",
                            req: displayCalculation.requirements.SS,
                          },
                        ] as const
                      ).map(({ key, label, req }) => (
                        <div
                          key={key}
                          className="px-3 py-2.5 rounded-xl border-2 border-ink bg-paper text-black flex flex-col gap-1.5"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-normal text-neutral-600">
                            {label}
                          </span>
                          <div className="font-black text-sm leading-none">
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
                              <span className="text-black">
                                Falta {formatGrade(req.requiredGrade, 2)}
                              </span>
                            ) : (
                              <span className="font-bold text-neutral-500">
                                Inatingível
                              </span>
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
