import React, { useMemo, useState } from "react";
import { Badge, Button, Card, NumberInput } from "@/components/ui";
import {
  CalendarX2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  RotateCcw,
} from "lucide-react";
import { calculateAbsenceRisk } from "@/core";
import type { Discipline } from "@/core";

/** Chave de persistência do ajuste manual de faltas por disciplina */
const overrideStorageKey = (id: string) => `sarue:discipline_absences:${id}:override`;

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
      localStorage.setItem(overrideStorageKey(disciplineId), String(Math.floor(value)));
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
 * Seção de controle de faltas da disciplina: mostra o registro oficial do SIGAA
 * e permite ajuste manual (ex.: faltas ainda não consolidadas pelo docente),
 * com o estado de risco recalculado em tempo real pela regra de 25% da UnB.
 */
export const AbsenceSection: React.FC<AbsenceSectionProps> = ({
  discipline,
  override,
  onOverrideChange,
  embedded = false,
}) => {
  const expandedStorageKey = `sarue:discipline_absences:${discipline.id}:expanded`;

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

  const sigaaAbsences =
    discipline.absences ?? discipline.sigaaCourse?.absences ?? null;
  const maxAbsences =
    discipline.maxAbsences ?? discipline.sigaaCourse?.maxAbsences ?? null;

  // Valor efetivo: ajuste manual tem precedência sobre o registro do SIGAA
  const hasAbsenceData = override !== null || sigaaAbsences !== null;
  const effectiveAbsences = override ?? sigaaAbsences ?? 0;
  const hasOverride = override !== null;

  const status = useMemo(
    () =>
      calculateAbsenceRisk({
        absences: effectiveAbsences,
        maxAbsences: maxAbsences ?? undefined,
        schedule: discipline.schedule || discipline.sigaaCourse?.schedule,
      }),
    [effectiveAbsences, maxAbsences, discipline.schedule, discipline.sigaaCourse],
  );

  const statusBadgeVariant =
    status.absences === 0
      ? "success"
      : status.isExceeded || status.isCritical
      ? "urgent"
      : status.isAtRisk
      ? "yellow"
      : "success";

  const handleOverrideChange = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) {
      onOverrideChange(null);
      return;
    }
    onOverrideChange(Math.max(0, Math.floor(val)));
  };

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
            <CalendarX2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-black group-hover:text-blue-ink transition-colors">
                Controle de Faltas
              </h3>
              {hasAbsenceData ? (
                <Badge variant={statusBadgeVariant} size="sm" className="font-black">
                  {status.absences}/{status.maxAbsences} faltas
                  {hasOverride ? " (manual)" : ""}
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm" className="font-bold">
                  Sem registro no SIGAA
                </Badge>
              )}
            </div>
            <p className="text-xs text-neutral-600 font-medium">
              Acompanhe o limite da UnB (25% da carga horária) e ajuste as faltas
              manualmente se o SIGAA ainda não consolidou.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleExpanded}
          className="cursor-pointer font-bold flex items-center gap-1.5"
          aria-label={isExpanded ? "Recolher controle de faltas" : "Expandir controle de faltas"}
        >
          <span>{isExpanded ? "Ocultar" : "Editar"}</span>
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
          {/* Registro oficial do SIGAA */}
          <div className="flex items-start gap-1.5 text-xs font-semibold text-neutral-600">
            <Info className="w-3.5 h-3.5 shrink-0 stroke-[2.5] text-neutral-500" />
            <span>
              {sigaaAbsences !== null ? (
                <>
                  SIGAA registra{" "}
                  <strong className="text-black">{sigaaAbsences} falta(s)</strong>{" "}
                  {maxAbsences !== null ? (
                    <>de no máximo {maxAbsences} (créditos × 2 − 1)</>
                  ) : (
                    <>— limite estimado: {status.maxAbsences}</>
                  )}
                  .
                </>
              ) : (
                <>Nenhuma falta registrada no SIGAA para esta disciplina ainda.</>
              )}
            </span>
          </div>

          {/* Ajuste manual */}
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={`absence-override-${discipline.id}`}
              className="text-xs font-black text-black"
            >
              Faltas (horas-falta):
            </label>
            <NumberInput
              id={`absence-override-${discipline.id}`}
              value={effectiveAbsences}
              onValueChange={handleOverrideChange}
              min={0}
              max={status.maxAbsences * 4}
              step={1}
              smallStep={1}
              placeholder="0"
              controls="sides"
              className="w-28 shrink-0"
              aria-label="Quantidade de faltas da disciplina"
            />

            {hasOverride ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOverrideChange(null)}
                className="cursor-pointer font-bold flex items-center gap-1.5"
                title="Descartar o ajuste manual e voltar a exibir o valor oficial do SIGAA"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Restaurar SIGAA</span>
              </Button>
            ) : null}
          </div>

          {/* Estado de risco com o valor efetivo */}
          <div className="flex items-start gap-1.5 text-xs font-bold">
            {status.isExceeded || status.isCritical || status.isAtRisk ? (
              <span className="text-ink-error">
                {status.isExceeded
                  ? `Limite ultrapassado (${status.absences}/${status.maxAbsences}). Conforme o regimento da UnB, o aluno é reprovado por faltas.`
                  : status.classesUntilReproval === 1
                  ? `Resta apenas 1 aula de ${status.hoursPerClass}h antes da reprovação por faltas.`
                  : `Restam ${status.classesUntilReproval} aulas de ${status.hoursPerClass}h antes de atingir o limite.`}
              </span>
            ) : (
              <span className="text-ink-success flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>
                  Situação tranquila: ainda é possível faltar em{" "}
                  {status.safeClassesToMiss}{" "}
                  {status.safeClassesToMiss === 1 ? "aula" : "aulas"} (
                  {status.remainingAbsences}h restantes do limite).
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </Container>
  );
};
