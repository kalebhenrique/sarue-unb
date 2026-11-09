import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import { Card, Button, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui";
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  FoldVertical,
  UnfoldVertical,
} from "lucide-react";
import type { ScrapedClass } from "@/core";
import {
  DAYS_HEADER,
  TIME_ROWS,
  DISCIPLINE_COLORS,
  type DisciplineColor,
} from "./types";

export interface ScheduleTimetableProps {
  conflicts: string[];
  selectedClasses: ScrapedClass[];
  slotOccupancy: Map<string, ScrapedClass[]>;
  disciplineColorMap: Map<string, DisciplineColor>;
  year: string;
  period: string;
  onDownloadPng: () => void;
  isExportingPng: boolean;
  /** Estado compacto inicial — sincronizado quando o modo semestre corrente liga/desliga */
  defaultCompact?: boolean;
}

const semesterLabel = (year: string, period: string) =>
  period === "1" ? `1º semestre de ${year}` : `2º semestre de ${year}`;

export const ScheduleTimetable = memo(forwardRef<
  HTMLDivElement,
  ScheduleTimetableProps
>(
  (
    {
      conflicts,
      selectedClasses,
      slotOccupancy,
      disciplineColorMap,
      year,
      period,
      onDownloadPng,
      isExportingPng,
      defaultCompact = false,
    },
    ref,
  ) => {
    // Compactar: esconde linhas de horário sem nenhuma aula na semana
    // Estado compacto persiste entre visitas — o reload não perde a escolha
    const [isCompact, setIsCompactState] = useState<boolean>(() => {
      try {
        const stored = localStorage.getItem("sarue_grade_compact");
        return stored === "true" || stored === "false" ? stored === "true" : defaultCompact;
      } catch {
        return defaultCompact;
      }
    });

    const setIsCompact = (
      updater: boolean | ((prev: boolean) => boolean),
    ) => {
      setIsCompactState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: boolean) => boolean)(prev)
            : updater;
        try {
          localStorage.setItem("sarue_grade_compact", String(next));
        } catch {
          // localStorage indisponível: preferência vale só nesta sessão
        }
        return next;
      });
    };

    // Reage a mudanças do modo semestre corrente (ex.: restaurar matriculadas compacta a grade)
    // Reage a mudanças do modo semestre corrente (ex.: restaurar matriculadas
    // compacta a grade) — mas não no primeiro render, que já leu o localStorage
    const firstCompactSync = useRef(true);
    useEffect(() => {
      if (firstCompactSync.current) {
        firstCompactSync.current = false;
        return;
      }
      setIsCompact(defaultCompact);
    }, [defaultCompact]);

    // Grade vazia sempre mostra a semana inteira — compacto sem aulas some com o corpo
    const hideEmptyRows = isCompact && selectedClasses.length > 0;
    const activeSlots = useMemo(
      () =>
        new Set(
          selectedClasses.flatMap((c) =>
            c.scheduleSlots.map((slot) => slot.globalSlotIndex),
          ),
        ),
      [selectedClasses],
    );

    return (
      <Card
        className="p-4 overflow-x-auto focus:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
        role="region"
        aria-label="Grade horária semanal (rolável na horizontal)"
        tabIndex={0}
        ref={ref}
      >
        <div className="min-w-[620px] space-y-3">
          {/* Cabeçalho institucional (integrante do PNG exportado) */}
          <div className="flex items-center justify-between gap-3 pb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/sarue-logo.png"
                alt=""
                aria-hidden="true"
                className="w-9 h-9 rounded-xl border-2 border-ink shrink-0 shadow-[2px_2px_0px_0px_var(--neo-shadow)] object-cover select-none pointer-events-none"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-black uppercase text-blue-ink tracking-tight">
                  Universidade de Brasília
                </h3>
                <p className="text-[11px] font-bold text-black mt-0.5 truncate">
                  {selectedClasses.length === 0
                    ? `Grade semanal • ${semesterLabel(year, period)}`
                    : `Grade semanal • ${semesterLabel(year, period)} • ${selectedClasses.length} ${
                        selectedClasses.length === 1
                          ? "disciplina"
                          : "disciplinas"
                      }`}
                </p>
              </div>
            </div>

            <div className="no-export flex items-center gap-2 shrink-0">
              {selectedClasses.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger
                    aria-label={
                      conflicts.length > 0
                        ? `Conflito de horário (${conflicts.length})`
                        : "Nenhum conflito de horário"
                    }
                    className={`flex h-7 w-7 items-center justify-center cursor-help rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue ${
                      conflicts.length > 0
                        ? "text-ink-error"
                        : "text-ink-success"
                    }`}
                  >
                    {conflicts.length > 0 ? (
                      <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] text-left space-y-1">
                    <p className="text-xs font-extrabold text-black">
                      {conflicts.length > 0
                        ? `Conflito de horário (${conflicts.length})`
                        : "Nenhum conflito detectado"}
                    </p>
                    {conflicts.length > 0 ? (
                      <>
                        <ul className="list-disc pl-3.5 space-y-0.5">
                          {conflicts.slice(0, 5).map((conf, i) => (
                            <li key={i}>{conf}</li>
                          ))}
                        </ul>
                        {conflicts.length > 5 ? (
                          <p>+ {conflicts.length - 5} outros</p>
                        ) : null}
                        <p>
                          Remova uma das turmas conflitantes ou clique em "Gerar
                          combinações".
                        </p>
                      </>
                    ) : (
                      <p>
                        Os horários das disciplinas selecionadas são
                        compatíveis.
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {selectedClasses.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCompact((c) => !c)}
                  title={
                    isCompact
                      ? "Mostra todos os horários do dia"
                      : "Remove os horários sem aula"
                  }
                  className="h-8 px-3 text-xs rounded-xl"
                >
                  {isCompact ? (
                    <UnfoldVertical className="w-3.5 h-3.5 stroke-[2.5]" />
                  ) : (
                    <FoldVertical className="w-3.5 h-3.5 stroke-[2.5]" />
                  )}
                  <span>{isCompact ? "Mostrar tudo" : "Compactar"}</span>
                </Button>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={onDownloadPng}
                disabled={selectedClasses.length === 0 || isExportingPng}
                isLoading={isExportingPng}
                title="Baixar grade em PNG"
                aria-label="Baixar grade em PNG"
                className="h-8 px-3 text-xs rounded-xl"
              >
                {!isExportingPng && (
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
                <span>Baixar PNG</span>
              </Button>
            </div>
          </div>

          {/* Cabeçalho dos Dias da Semana */}
          <div className="grid grid-cols-[88px_repeat(6,minmax(0,1fr))] gap-1.5 pb-2 border-b-2 border-black/15 text-center text-xs font-black uppercase text-black">
            <div className="p-1.5 text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Horário
            </div>
            {DAYS_HEADER.map((day) => (
              <div
                key={day.id}
                className="p-1.5 bg-neutral-100 border-2 border-ink rounded-lg"
              >
                <span>{day.short}</span>
              </div>
            ))}
          </div>

          {/* Linhas de Horários (15 slots, 3 turnos) */}
          <div className="divide-y-2 divide-black/10 mt-1">
            {TIME_ROWS.map((timeRow, idx) => {
              if (hideEmptyRows && !activeSlots.has(timeRow.globalIndex))
                return null;

              const isShiftStart =
                idx > 0 && TIME_ROWS[idx - 1].shift !== timeRow.shift;

              return (
                <div
                  key={`${timeRow.shift}-${timeRow.period}`}
                  className={`grid grid-cols-[88px_repeat(6,minmax(0,1fr))] gap-1.5 py-1 items-stretch ${
                    isShiftStart
                      ? "mt-1.5 pt-1.5 border-t-2 border-black/20"
                      : ""
                  }`}
                >
                  {/* Faixa horária na esquerda */}
                  <div className="flex flex-col justify-center items-center text-[11px] font-mono font-bold text-neutral-600 bg-neutral-50 rounded border border-black/15 px-2 py-1">
                    <span className="font-black text-black">
                      {timeRow.shift}
                      {timeRow.period}
                    </span>
                    <span className="text-[11px] tracking-tight whitespace-nowrap">
                      {timeRow.range}
                    </span>
                  </div>

                  {/* 6 Células dos dias (Segunda a Sábado) */}
                  {DAYS_HEADER.map((day) => {
                    const cellKey = `${day.id}-${timeRow.globalIndex}`;
                    const classesInSlot = slotOccupancy.get(cellKey) || [];
                    const isConflictSlot = classesInSlot.length > 1;

                    if (classesInSlot.length === 0) {
                      return (
                        <div
                          key={day.id}
                          className="h-11 rounded-lg border border-dashed border-black/15 bg-neutral-50"
                        />
                      );
                    }

                    // Se houver conflito nesta célula (duas turmas no mesmo slot)
                    if (isConflictSlot) {
                      return (
                        <div
                          key={day.id}
                          className="h-11 p-1 rounded-lg border-2 border-neo-danger bg-pastel-red text-ink-error shadow-[1px_1px_0px_0px_var(--neo-shadow)] flex flex-col justify-center items-center text-center focus:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-danger"
                          role="img"
                          aria-label={`Conflito entre ${classesInSlot.map((c) => c.disciplineCode).join(" e ")}`}
                          tabIndex={0}
                          title={`Conflito: ${classesInSlot.map((c) => c.disciplineCode).join(" vs ")}`}
                        >
                          <span className="text-[11px] font-black uppercase">
                            Conflito!
                          </span>
                          <span className="text-[11px] font-bold truncate">
                            {classesInSlot
                              .map((c) => c.disciplineCode)
                              .join("/")}
                          </span>
                        </div>
                      );
                    }

                    // Célula preenchida por 1 disciplina
                    const c = classesInSlot[0];
                    const color =
                      disciplineColorMap.get(c.disciplineCode) ||
                      DISCIPLINE_COLORS[0];
                    return (
                      <div
                        key={day.id}
                        className={`h-11 p-1 rounded-lg border-2 ${color.border} ${color.bg} flex flex-col justify-between overflow-hidden focus:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue`}
                        tabIndex={0}
                        role="img"
                        aria-label={`${c.disciplineCode}, Turma ${c.classCode}, ${c.disciplineName}, Sala ${c.classroom}`}
                        title={`${c.disciplineCode} - ${c.disciplineName} (Turma ${c.classCode}) - Sala: ${c.classroom}`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-black leading-none">
                          <span className={color.text}>{c.disciplineCode}</span>
                          <span className="text-black px-1 rounded text-[11px]">
                            T{c.classCode}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-neutral-800 truncate">
                          {c.classroom}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Legenda das Disciplinas (incluída no PNG exportado) */}
          {selectedClasses.length > 0 ? (
            <div className="pt-3 mt-2 border-t-2 border-black/15">
              <span className="text-[11px] font-black uppercase text-black block mb-1.5">
                Legenda das disciplinas
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedClasses.map((cls) => {
                  const color =
                    disciplineColorMap.get(cls.disciplineCode) ||
                    DISCIPLINE_COLORS[0];
                  return (
                    <div
                      key={cls.id}
                      className="flex items-center gap-2 p-1.5 bg-neutral-50 border border-black/20 rounded-lg text-[11px]"
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-ink shrink-0"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="font-black text-black truncate">
                        {cls.disciplineCode} - {cls.disciplineName} (T
                        {cls.classCode})
                      </span>
                      <span className="text-neutral-500 font-medium ml-auto shrink-0">
                        {cls.classroom}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    );
  },
));

ScheduleTimetable.displayName = "ScheduleTimetable";
