import React, { useMemo, useState } from "react";
import { Button, Card, NumberInput } from "@/components/ui";
import {
  CalendarX2,
  CheckCircle2,
  ChevronDown,
  OctagonX,
  RotateCcw,
  TriangleAlert,
  Info,
} from "lucide-react";
import { calculateAbsenceRisk, convertSigaaHoursToClassAbsences } from "@/core";
import type { Discipline } from "@/core";

/** Chave de persistência do ajuste manual de faltas por disciplina */
const overrideStorageKey = (id: string) =>
  `sarue:discipline_absences:${id}:override`;

/** Lê o ajuste manual de faltas persistido (undefined = usar valor do SIGAA) */
export function readAbsenceOverride(disciplineId: string): number | null {
  try {
    const raw = localStorage.getItem(overrideStorageKey(disciplineId));
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
  } catch {
    return null;
  }
}

/** Persiste o ajuste manual de faltas (null = remover override) */
export function writeAbsenceOverride(
  disciplineId: string,
  value: number | null,
): void {
  try {
    if (value === null) {
      localStorage.removeItem(overrideStorageKey(disciplineId));
    } else {
      localStorage.setItem(
        overrideStorageKey(disciplineId),
        String(Math.floor(value)),
      );
    }
  } catch {
    // localStorage indisponível (ex.: modo privado): segue sem persistir
  }
}

interface AbsenceSectionProps {
  discipline: Discipline;
  /** Ajuste manual atual (null = sem ajuste, usa valor do SIGAA) */
  override: number | null;
  onOverrideChange: (value: number | null) => void;
  /** Quando embutido dentro de outro Card (evita sombras empilhadas) */
  embedded?: boolean;
}

/**
 * Seção de controle de faltas da disciplina: uma linha de previsão (em aulas,
 * a unidade mental do aluno) colada ao ajuste manual para os casos em que o
 * docente ainda não lançou as faltas. O resumo "como estou?" mora no badge do
 * card (CoursesScreen); aqui fica só o que o badge não diz.
 */
export const AbsenceSection: React.FC<AbsenceSectionProps> = ({
  discipline,
  override,
  onOverrideChange,
  embedded = false,
}) => {
  const expandedStorageKey = `sarue:discipline_absences:${discipline.id}:expanded`;
  const contentId = `absence-content-${discipline.id}`;

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(expandedStorageKey);
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(expandedStorageKey, String(next));
      } catch {
        // segue sem persistir
      }
      return next;
    });
  };

  const rawSigaaAbsences =
    discipline.absences ?? discipline.sigaaCourse?.absences ?? null;

  const sigaaAbsences = useMemo(
    () =>
      rawSigaaAbsences !== null
        ? (convertSigaaHoursToClassAbsences(
            rawSigaaAbsences,
            discipline.schedule || discipline.sigaaCourse?.schedule,
          ) ?? null)
        : null,
    [rawSigaaAbsences, discipline.schedule, discipline.sigaaCourse?.schedule],
  );

  // Valor efetivo: ajuste manual tem precedência sobre o registro do SIGAA (ambos em dias/aulas)
  const effectiveAbsences = override ?? sigaaAbsences ?? 0;
  const hasOverride = override !== null;
  /** Há fonte de verdade (registro do SIGAA ou ajuste manual)? */
  const hasData = sigaaAbsences !== null || hasOverride;

  const status = useMemo(
    () =>
      calculateAbsenceRisk({
        absences: effectiveAbsences,
        maxAbsences:
          discipline.maxAbsences ?? discipline.sigaaCourse?.maxAbsences,
        schedule: discipline.schedule || discipline.sigaaCourse?.schedule,
      }),
    [
      effectiveAbsences,
      discipline.maxAbsences,
      discipline.sigaaCourse,
      discipline.schedule,
    ],
  );

  // Unidade de exibição: faltas em aulas/encontros
  const remainingClasses = status.safeClassesToMiss;

  const handleOverrideChange = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) {
      onOverrideChange(null);
      return;
    }
    const next = Math.max(0, Math.floor(val));
    // Valor igual ao registro do SIGAA = estado "não mexido": não cria override.
    // Além da semântica, isso impede o commit do NumberField no blur de recriar
    // o override com o valor do SIGAA logo depois do botão Restaurar.
    onOverrideChange(next === sigaaAbsences ? null : next);
  };

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
        aria-controls={contentId}
        aria-label={
          isExpanded
            ? "Recolher controle de faltas"
            : "Expandir controle de faltas"
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
            <CalendarX2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <h3 className="text-sm font-black text-black group-hover:text-blue-ink transition-colors">
            Controle de Faltas
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
        id={contentId}
        className={`grid transition-[grid-template-rows] duration-150 ease-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!isExpanded}
        inert={!isExpanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pb-2 pl-4 sm:pl-12 mt-3 space-y-2.5">
            {/* Efeito: a previsão com o valor efetivo, recalcada a cada edição */}
            <div aria-live="polite">
              {!hasData ? (
                <p className="text-xs font-semibold text-neutral-600">
                  Sem registro de faltas no SIGAA para esta disciplina ainda.
                </p>
              ) : status.isExceeded ? (
                <div
                  role="alert"
                  className="rounded-lg border-2 border-ink bg-pastel-red dark:bg-paper dark:border-l-[6px] dark:border-l-neo-coral text-black px-3.5 py-2.5 space-y-1"
                >
                  <p className="flex items-center gap-1.5 text-xs font-black text-error-ink">
                    <OctagonX
                      className="w-4 h-4 stroke-[2.5] shrink-0"
                      aria-hidden="true"
                    />
                    Limite de faltas excedido
                  </p>
                  <p className="text-xs font-semibold text-neutral-800">
                    Você faltou {status.absences} de {status.maxAbsences}{" "}
                    {status.maxAbsences === 1 ? "aula permitida" : "aulas permitidas"} —{" "}
                    {status.absences - status.maxAbsences}{" "}
                    {status.absences - status.maxAbsences === 1 ? "aula" : "aulas"} além do limite de
                    25% da carga horária. Reprovado por faltas na UnB.
                  </p>
                  <p className="text-xs font-semibold text-neutral-800">
                    Confira o lançamento no SIGAA, fale com o professor e
                    verifique o prazo de trancamento.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-bold">
                  {status.isCritical || status.isAtRisk ? (
                    <div
                      className={`flex items-start gap-1.5 rounded-lg border-2 border-ink px-3.5 py-2 text-black ${
                        status.isCritical
                          ? "bg-pastel-red dark:bg-paper dark:border-l-[6px] dark:border-l-neo-coral"
                          : "bg-pastel-yellow dark:bg-paper dark:border-l-[6px] dark:border-l-neo-yellow"
                      }`}
                    >
                      <TriangleAlert
                        className="w-3.5 h-3.5 stroke-[2.5] shrink-0 mt-px"
                        aria-hidden="true"
                      />
                      <span>
                        {remainingClasses <= 0
                          ? "O limite está no fim: a próxima aula perdida leva à reprovação."
                          : remainingClasses === 1
                            ? `Resta apenas 1 aula (${status.hoursPerClass}h) antes da reprovação por faltas.`
                            : `Restam ${remainingClasses} aulas (${status.hoursPerClass}h cada) antes de atingir o limite.`}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5 text-black">
                        <CheckCircle2
                          className="w-3.5 h-3.5 stroke-[2.5] shrink-0 text-ink-success"
                          aria-hidden="true"
                        />
                        <span>
                          Você ainda pode faltar em{" "}
                          <strong>
                            {remainingClasses}{" "}
                            {remainingClasses === 1 ? "aula" : "aulas"}
                          </strong>{" "}
                          ({status.hoursPerClass}h cada).
                        </span>
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Causa: ajuste manual, colado na previsão acima. Override ativo
                acende Azul Pastel — a linguagem de "engajado" do sistema. */}
            <div
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border-2 px-2.5 py-1.5 transition-colors duration-150 ${
                hasOverride
                  ? "border-ink bg-pastel-blue dark:bg-paper dark:border-l-[6px] dark:border-l-sticker-blue"
                  : "border-transparent"
              }`}
            >
              {hasOverride ? (
                <>
                  <p className="w-full text-xs font-black text-black">
                    Ajuste manual
                    {sigaaAbsences !== null
                      ? ` — o SIGAA ainda mostra ${sigaaAbsences}`
                      : " — sem registro no SIGAA"}
                  </p>
                </>
              ) : null}
              <label
                htmlFor={`absence-override-${discipline.id}`}
                className="text-xs font-black text-black shrink-0"
              >
                Faltas:
              </label>
              <NumberInput
                id={`absence-override-${discipline.id}`}
                value={hasData ? effectiveAbsences : null}
                onValueChange={handleOverrideChange}
                min={0}
                max={99}
                step={1}
                smallStep={1}
                placeholder="—"
                controls="sides"
                className="w-28 shrink-0"
                aria-label="Quantidade de faltas da disciplina, em aulas faltadas"
              />
              <span className="text-[11px] font-bold text-neutral-500 shrink-0">
                {effectiveAbsences === 1 ? "aula faltada" : "aulas faltadas"}
              </span>
              {hasOverride ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOverrideChange(null)}
                  className="cursor-pointer ml-auto shrink-0"
                  title="Descartar o ajuste manual e voltar a mostrar o valor oficial do SIGAA"
                >
                  <RotateCcw
                    className="w-3.5 h-3.5 stroke-[2.5]"
                    aria-hidden="true"
                  />
                  Restaurar SIGAA
                </Button>
              ) : null}
            </div>
            <p className="flex text-xs font-semibold text-neutral-500 items-center gap-1">
              <Info className="w-3 h-3 stroke-2 shrink-0 text-blue-ink" />
              Cada falta no contador representa 1 encontro/dia de aula ({status.hoursPerClass}h).
              {rawSigaaAbsences !== null
                ? ` O SIGAA registra ${rawSigaaAbsences} horas-falta, equivalente a ${sigaaAbsences} ${sigaaAbsences === 1 ? "falta" : "faltas"}.`
                : ""}
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
};
