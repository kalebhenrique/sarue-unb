import React, { useState } from "react";
import type { FlowchartDiscipline, FlowchartSemester } from "@/core";
import { CircleDotDashed, Lock, Unlock, CalendarPlus } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge, Checkbox } from "../ui";

export interface FlowchartListProps {
  semesters: FlowchartSemester[];
  visibleCodes: Set<string>;
  onToggle: (code: string, isEffectivelyCompleted: boolean) => void;
  /** Mapa código → nome para exibir nomes reais dos pré-requisitos no tooltip */
  disciplineNames?: Map<string, string>;
  onSendToGrade?: (code: string, name: string) => void;
}

// Ícone de estado da disciplina: só o ícone (concluída não tem), tooltip explica
const StatusIcon: React.FC<{ d: FlowchartDiscipline }> = ({ d }) => {
  if (d.status === "in_progress") {
    return (
      <Tooltip>
        <TooltipTrigger aria-label="Cursando" className="shrink-0 cursor-help">
          <CircleDotDashed className="w-3.5 h-3.5 stroke-[2.5] text-blue-ink" />
        </TooltipTrigger>
        <TooltipContent>Cursando neste semestre</TooltipContent>
      </Tooltip>
    );
  }
  if (d.status === "available") {
    return (
      <Tooltip>
        <TooltipTrigger
          aria-label="Disponível"
          className="shrink-0 cursor-help"
        >
          <Unlock className="w-3.5 h-3.5 stroke-[2.5] text-neutral-700" />
        </TooltipTrigger>
        <TooltipContent>Disponível: pré-requisitos concluídos</TooltipContent>
      </Tooltip>
    );
  }
  if (d.status === "locked") {
    return (
      <Tooltip>
        <TooltipTrigger aria-label="Bloqueada" className="shrink-0 cursor-help">
          <Lock className="w-3.5 h-3.5 stroke-[2.5] text-neutral-500" />
        </TooltipTrigger>
        <TooltipContent>
          Bloqueada — falta:{" "}
          {d.missingPrerequisites.length > 1
            ? `${d.missingPrerequisites.length} pré-requisitos`
            : d.missingPrerequisites[0]?.split(" ")[0] || "pré-requisito"}
        </TooltipContent>
      </Tooltip>
    );
  }
  return null;
};

// Pill de pré-requisitos: rótulo claro na linha, detalhe (código + nome) no tooltip
const PrereqPill: React.FC<{
  d: FlowchartDiscipline;
  disciplineNames?: Map<string, string>;
}> = ({ d, disciplineNames }) => {
  if (d.prerequisites.length === 0) return null;

  // Nome real: mapa da matriz/histórico primeiro; fallback para o formato "COD (Nome)" dos pendentes
  const nameFor = (code: string) =>
    disciplineNames?.get(code) ||
    d.missingPrerequisites
      .find((m) => m.startsWith(code))
      ?.replace(/^[^(]*\((.*)\)$/, "$1");

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`Pré-requisitos de ${d.name}: ${d.prerequisites.length} disciplina(s)`}
        className="hidden md:inline-flex cursor-help items-center gap-1 text-[11px] font-black px-2.5 py-0.5 border-2 border-ink rounded-full bg-paper text-neutral-700 dark:bg-neutral-300 dark:text-slate-50 shrink-0 transition-colors duration-150 hover:bg-pastel-yellow"
      >
        Pré-requisitos
      </TooltipTrigger>
      <TooltipContent className="text-left max-w-[260px]">
        <p className="font-black mb-1">Pré-requisitos de {d.name}:</p>
        <ul className="space-y-0.5">
          {d.prerequisites.map((p) => {
            const name = nameFor(p);
            return (
              <li key={p} className="flex items-baseline gap-1.5">
                <span className="font-mono font-medium shrink-0">{p}</span>
                {name && (
                  <span className="font-medium text-neutral-600">{name}</span>
                )}
              </li>
            );
          })}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};

// Linha da disciplina: código, nome, pré-requisitos e status — lista, não card
// Memoizada: a busca muda visibleCodes a cada tecla, mas linhas fora dos semestres afetados não precisam re-render
const DisciplineRow: React.FC<{
  d: FlowchartDiscipline;
  onToggle: (code: string, isEffectivelyCompleted: boolean) => void;
  disciplineNames?: Map<string, string>;
  onSendToGrade?: (code: string, name: string) => void;
}> = React.memo(({ d, onToggle, disciplineNames, onSendToGrade }) => {
  const isCompleted = d.status === "completed";
  const isMandatory = d.nature !== "Optativa" && d.nature !== "Complementar";

  return (
    <div
      className={`cv-row group flex items-start gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-neutral-50 ${
        isCompleted ? "bg-neutral-50/70" : "bg-paper"
      }`}
    >
      <div className="pt-0.5 shrink-0">
        <Checkbox
          checked={isCompleted}
          aria-label={
            isCompleted
              ? `Desmarcar ${d.name} como concluída`
              : `Marcar ${d.name} como concluída`
          }
          onClick={() => onToggle(d.code, isCompleted)}
          title={
            isCompleted
              ? "Desmarcar disciplina"
              : "Marcar como concluída manualmente"
          }
          className="data-checked:bg-neo-green data-checked:text-ink hover:bg-neutral-100"
        />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        {/* Linha 1: Apenas o nome da disciplina em destaque */}
        <p
          className="text-sm font-semibold leading-snug line-clamp-2"
          title={`${d.code} - ${d.name}`}
        >
          <span
            className={
              isCompleted
                ? "text-neutral-500 line-through decoration-2"
                : "text-black"
            }
          >
            {d.name}
          </span>
          {isMandatory && (
            <span
              className={`ml-1 font-black ${
                isCompleted ? "text-neutral-500" : "text-neo-danger"
              }`}
              title="Disciplina obrigatória"
              aria-label="Obrigatória"
            >
              *
            </span>
          )}
        </p>

        {/* Linha 2: Código + carga horária e status alinhado à direita */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-xs font-medium text-neutral-600 truncate">
            {d.code} • {d.workloadHours}h
          </span>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {/* Botão rápido no hover: Enviar para o Montar Grade */}
            {onSendToGrade && (
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  onClick={() => onSendToGrade(d.code, d.name)}
                  aria-label={`Enviar ${d.name} para o Montar Grade`}
                  className="cursor-pointer p-1 rounded-md border border-ink bg-paper hover:bg-pastel-yellow text-neutral-700 hover:text-black transition-[opacity,background-color,color] shrink-0 shadow-neo-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <CalendarPlus className="w-3.5 h-3.5 stroke-[2.5]" />
                </TooltipTrigger>
                <TooltipContent>Enviar para o Montar Grade</TooltipContent>
              </Tooltip>
            )}

            {/* Pré-requisitos: uma pill com tooltip, em vez de códigos soltos */}
            <PrereqPill d={d} disciplineNames={disciplineNames} />

            {/* Estado (ícone de cursando, bloqueado, etc.) */}
            <StatusIcon d={d} />
          </div>
        </div>
      </div>
    </div>
  );
});

// Última escolha do usuário de quais semestres ficam abertos no accordion
const OPEN_SEMESTERS_STORAGE_KEY = "unb_flowchart_open_semesters";

const isSemesterFullyCompleted = (sem: FlowchartSemester): boolean =>
  sem.disciplines.length > 0 &&
  sem.disciplines.every((d) => d.status === "completed");

export const FlowchartList: React.FC<FlowchartListProps> = ({
  semesters,
  visibleCodes,
  onToggle,
  disciplineNames,
  onSendToGrade,
}) => {
  // Semestres que têm disciplina visível com o filtro/busca atuais (apenas semestres > 0)
  const visible = semesters.filter(
    (sem) =>
      sem.level > 0 && sem.disciplines.some((d) => visibleCodes.has(d.code)),
  );

  // Semestres abertos: preferência salva no localStorage vence; sem preferência,
  // semestres totalmente concluídos nascem minimizados e os demais abertos.
  const [openValues, setOpenValues] = useState<string[] | null>(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_SEMESTERS_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String);
      }
    } catch {}
    return null;
  });

  const handleOpenChange = (next: unknown) => {
    const list = Array.isArray(next) ? next.map(String) : [];
    setOpenValues(list);
    try {
      window.localStorage.setItem(
        OPEN_SEMESTERS_STORAGE_KEY,
        JSON.stringify(list),
      );
    } catch {}
  };

  const defaultOpenValues = visible
    .filter((sem) => !isSemesterFullyCompleted(sem))
    .map((sem) => String(sem.level));

  return (
    <Accordion
      multiple
      value={openValues ?? defaultOpenValues}
      onValueChange={handleOpenChange}
    >
      {visible.map((sem) => {
        const discs = sem.disciplines.filter((d) => visibleCodes.has(d.code));

        // Badge e contagem olham o semestre inteiro, não o subconjunto filtrado
        const completedCount = sem.disciplines.filter(
          (d) => d.status === "completed",
        ).length;
        const allCompleted = isSemesterFullyCompleted(sem);

        return (
          <AccordionItem
            key={sem.level}
            value={String(sem.level)}
            className="border-0 border-t-2 border-ink first:border-t-0"
          >
            <AccordionTrigger className="px-4 py-2.5 bg-paper hover:bg-neutral-50 rounded-none font-black text-[11px] uppercase tracking-wider text-black">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span>{sem.level}º Semestre</span>
                {allCompleted && (
                  <Badge variant="success" size="sm">
                    Concluído
                  </Badge>
                )}
              </div>
              <span className="text-[11px] font-bold text-neutral-600 normal-case tracking-normal shrink-0 mr-2">
                {completedCount}/{sem.disciplines.length} concluídas ·{" "}
                {sem.totalHours}h
              </span>
            </AccordionTrigger>

            <AccordionContent className="p-0 bg-paper border-t-2 border-ink">
              <div className="divide-y divide-black/10">
                {discs.map((d) => (
                  <DisciplineRow
                    key={d.code}
                    d={d}
                    onToggle={onToggle}
                    disciplineNames={disciplineNames}
                    onSendToGrade={onSendToGrade}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
};
