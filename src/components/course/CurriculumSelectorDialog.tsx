import React, { useState, useEffect, useMemo } from "react";
import type { CurriculumStructure } from "@/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Badge,
} from "@/components/ui";
import { CourseSelect } from "./CourseSelect";
import { ArrowRight, BookOpen, Check, Layers } from "lucide-react";

/** Enter/Espaço acionam elemento com role="button". */
const activateOnKey =
  (fn: () => void) =>
  (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };

/** Rótulo de turno: Matutino + Vespertino juntos é o turno Diurno da UnB. */
const shiftLabel = (shift: string): string =>
  shift.replace(/matutino\s*(?:e|\/|-)\s*vespertino/i, "Diurno");

export interface CurriculumSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  curricula: CurriculumStructure[];
  currentCurriculumId?: string;
  currentCurriculumCode?: string;
  initialCourseName?: string;
  onSelect: (curriculum: CurriculumStructure) => void;
  onLoadAllCurricula?: () => Promise<CurriculumStructure[]>;
}

export const CurriculumSelectorDialog: React.FC<
  CurriculumSelectorDialogProps
> = ({
  isOpen,
  onClose,
  curricula,
  currentCurriculumId,
  currentCurriculumCode,
  initialCourseName,
  onSelect,
  onLoadAllCurricula,
}) => {
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [isLoadingAll, setIsLoadingAll] = useState(false);

  // Normalização de texto sem acentos
  const norm = (s: string) =>
    (s || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[^A-Z0-9 ]/g, "");

  // Agrupa todas as matrizes disponíveis por curso
  const coursesMap = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        structures: CurriculumStructure[];
        shifts: Set<string>;
        hasCurrent: boolean;
        activeCount: number;
      }
    >();

    for (const c of curricula) {
      const name = (c.courseName || "Sem Nome").trim();
      if (!name) continue;
      let entry = map.get(name);
      if (!entry) {
        entry = {
          name,
          structures: [],
          shifts: new Set(),
          hasCurrent: false,
          activeCount: 0,
        };
        map.set(name, entry);
      }
      entry.structures.push(c);
      if (c.shift) entry.shifts.add(c.shift);
      if (c.status === "Ativa") entry.activeCount++;
      if (
        (Boolean(currentCurriculumId) && c.id === currentCurriculumId) ||
        (Boolean(currentCurriculumCode) && c.code === currentCurriculumCode)
      ) {
        entry.hasCurrent = true;
      }
    }

    return map;
  }, [curricula, currentCurriculumId, currentCurriculumCode]);

  // Lista ordenada de cursos (curso atual primeiro, depois alfabético)
  const coursesList = useMemo(() => {
    return Array.from(coursesMap.values()).sort((a, b) => {
      if (a.hasCurrent !== b.hasCurrent) return a.hasCurrent ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [coursesMap]);

  // Opções do seletor: nome + códigos de matriz (a busca acha pelos dois)
  const courseOptions = useMemo(
    () =>
      coursesList.map((c) => ({
        name: c.name,
        codes: c.structures.map((s) => s.code),
      })),
    [coursesList]
  );

  // Ao abrir o modal, define o curso selecionado inicial (se houver perfil) ou deixa nulo
  useEffect(() => {
    if (isOpen) {
      if (initialCourseName && initialCourseName.trim()) {
        const normInit = norm(initialCourseName);
        const match = coursesList.find(
          (c) => norm(c.name) === normInit || normInit.includes(norm(c.name))
        );
        setSelectedCourse(match ? match.name : initialCourseName);
      } else {
        setSelectedCourse(null);
      }

      // Se há poucas matrizes carregadas (apenas do curso anterior), carrega catálogo completo
      if (curricula.length < 50 && onLoadAllCurricula) {
        setIsLoadingAll(true);
        onLoadAllCurricula().finally(() => setIsLoadingAll(false));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Matrizes do curso selecionado, ordenadas
  const selectedCourseStructures = useMemo(() => {
    if (!selectedCourse) return [];
    const normSelected = norm(selectedCourse);
    const entry =
      coursesMap.get(selectedCourse) ||
      coursesList.find(
        (c) => norm(c.name) === normSelected || normSelected.includes(norm(c.name))
      );

    const list = entry ? entry.structures : [];

    return [...list].sort((a, b) => {
      const aCurrent =
        a.code === currentCurriculumCode || a.id === currentCurriculumId;
      const bCurrent =
        b.code === currentCurriculumCode || b.id === currentCurriculumId;
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
      if ((a.status === "Ativa") !== (b.status === "Ativa"))
        return a.status === "Ativa" ? -1 : 1;
      return (b.createdYear || "").localeCompare(a.createdYear || "");
    });
  }, [selectedCourse, coursesMap, coursesList, currentCurriculumCode, currentCurriculumId]);

  const handleSelectStructure = (structure: CurriculumStructure) => {
    onSelect(structure);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={true}
        className="sm:max-w-xl max-h-[85vh] flex flex-col"
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5 pr-8">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-neo-yellow border-2 border-ink shadow-neo-sm flex items-center justify-center">
              <BookOpen className="w-4 h-4 stroke-[2.5] text-ink" />
            </div>
            <DialogTitle>
              {selectedCourse ? (
                "Matriz Curricular"
              ) : (
                <>
                  Escolher Curso da UnB{" "}
                  {coursesList.length > 0 && (
                    <span className="text-sm font-bold text-neutral-600 tracking-normal">
                      ({coursesList.length}{" "}
                      {coursesList.length === 1 ? "curso" : "cursos"})
                    </span>
                  )}
                </>
              )}
            </DialogTitle>
          </div>
          <DialogDescription>
            {selectedCourse
              ? `Estruturas curriculares oficiais de ${selectedCourse}.`
              : "Selecione o curso para visualizar e escolher a matriz curricular."}
          </DialogDescription>
        </DialogHeader>

        {/* Seletor de curso com busca interna */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 px-0.5">
            Curso
          </span>
          <CourseSelect
            courses={courseOptions}
            value={selectedCourse}
            onChange={(name) => setSelectedCourse(name)}
            placeholder="Selecione seu curso da UnB..."
          />
        </div>

        {selectedCourse ? (
          // MATRIZES DO CURSO SELECIONADO — linhas de select, sem cards
          <div className="flex-1 min-h-0 flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 px-0.5">
              Matriz Curricular
            </span>
            <div
              className="flex-1 overflow-y-auto space-y-1 pr-1 pb-1 min-h-0"
              aria-busy={isLoadingAll}
            >
              {selectedCourseStructures.map((curr) => {
                const isSelected =
                  curr.id === currentCurriculumId ||
                  curr.code === currentCurriculumCode;
                const isActive = curr.status === "Ativa";

                const meta = [
                  curr.shift ? `Turno: ${shiftLabel(curr.shift)}` : null,
                  curr.totalHours ? `${curr.totalHours}h totais` : null,
                  `${curr.mandatoryDisciplines.length} obrigatórias`,
                  curr.electiveDisciplines?.length > 0
                    ? `${curr.electiveDisciplines.length} optativas`
                    : null,
                  curr.createdYear ? `Criada em ${curr.createdYear}` : null,
                ].filter(Boolean) as string[];

                return (
                  <div
                    key={curr.id}
                    role={isSelected ? undefined : "button"}
                    tabIndex={isSelected ? undefined : 0}
                    aria-label={
                      isSelected
                        ? undefined
                        : `Selecionar matriz ${curr.code}`
                    }
                    onClick={
                      isSelected
                        ? undefined
                        : () => handleSelectStructure(curr)
                    }
                    onKeyDown={
                      isSelected
                        ? undefined
                        : activateOnKey(() => handleSelectStructure(curr))
                    }
                    className={
                      isSelected
                        ? "group flex items-center gap-2.5 bg-pastel-green border-2 border-ink rounded-lg p-2.5 select-none"
                        : "group flex items-center gap-2.5 bg-paper border-2 border-transparent rounded-lg p-2.5 cursor-pointer select-none outline-hidden hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neo-blue transition-colors duration-150"
                    }
                  >
                    {/* Bloco de ícone — Layers neutro, receita do popover "Todos os instaladores" do site.
                        text-black remapa para giz no escuro; text-ink é preto fixo e sumiria na placa. */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-paper">
                      <Layers className="w-4 h-4 stroke-[2.5] text-black" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          title={curr.code}
                          className="inline-block max-w-[160px] truncate align-middle text-[11px] font-black text-black bg-paper px-1.5 py-0.5 border-2 border-ink rounded-md"
                        >
                          {curr.code}
                        </span>
                        <Badge
                          size="sm"
                          variant={isActive ? "success" : "neutral"}
                          className={
                            isActive
                              ? undefined
                              : "bg-neutral-200 text-neutral-700 dark:bg-neutral-300 dark:text-slate-50"
                          }
                        >
                          {curr.status}
                        </Badge>
                      </div>
                      <p
                        title={meta.join(" • ")}
                        className="text-[11px] font-medium text-neutral-600 mt-0.5 truncate"
                      >
                        {meta.join(" • ")}
                      </p>
                    </div>

                    {isSelected ? (
                      <div className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 bg-neo-green text-ink border-2 border-ink rounded-full text-[11px] leading-4 font-bold">
                        <Check className="w-3 h-3 stroke-[3]" />
                        Atual
                      </div>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-neo-blue text-white transition-colors duration-150 group-hover:bg-neo-blueHover"
                      >
                        <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : isLoadingAll ? (
          // Primeira carga do catálogo: skeleton sem borda (A Regra do Bloco
          // Sem Borda), espelhando as linhas de matriz
          <div className="space-y-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-neutral-200 rounded-lg h-[62px] animate-pulse"
                style={{ opacity: 1 - i * 0.08 }}
              />
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-black/15 bg-neutral-50 rounded-xl p-6 text-center">
            <p className="text-xs font-black text-neutral-800">
              Nenhum curso selecionado
            </p>
            <p className="text-xs font-semibold text-neutral-500 mt-1">
              Abra o seletor acima e escolha seu curso da UnB para ver as
              matrizes curriculares disponíveis.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
