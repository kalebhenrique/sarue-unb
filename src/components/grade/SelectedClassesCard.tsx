import React from "react";
import { Card, Button, Badge, FilterSelect } from "@/components/ui";
import { BookMarked, Trash2, Sparkles, Save } from "lucide-react";
import type { ScrapedClass } from "@/core";
import { SHIFT_OPTIONS, DISCIPLINE_COLORS, type DisciplineColor } from "./types";

export interface SelectedClassesCardProps {
  selectedClasses: ScrapedClass[];
  disciplineColorMap: Map<string, DisciplineColor>;
  onClearGrade: () => void;
  onRemoveClass: (id: string) => void;
  shiftFilter: "ALL" | "M" | "T" | "N";
  onShiftFilterChange: (shift: "ALL" | "M" | "T" | "N") => void;
  onGenerateCombinations: () => void;
  onSaveGrade: () => void;
  isSolving: boolean;
  isSaving: boolean;
  /** A grade atual difere da última versão salva — liga o indicador "Não salva". */
  isDirty?: boolean;
}

export const SelectedClassesCard: React.FC<SelectedClassesCardProps> = ({
  selectedClasses,
  disciplineColorMap,
  onClearGrade,
  onRemoveClass,
  shiftFilter,
  onShiftFilterChange,
  onGenerateCombinations,
  onSaveGrade,
  isSolving,
  isSaving,
  isDirty = false,
}) => {
  // A Regra do Risco Preto com guarda de 2 cliques: o primeiro clique arma a
  // confirmação (4s); o segundo executa a limpeza de verdade.
  const [confirmingClear, setConfirmingClear] = React.useState(false);
  const clearTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (selectedClasses.length === 0) setConfirmingClear(false);
  }, [selectedClasses.length]);

  const handleClearClick = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      clearTimerRef.current = window.setTimeout(
        () => setConfirmingClear(false),
        4000,
      );
      return;
    }
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    setConfirmingClear(false);
    onClearGrade();
  };
  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-ink/10 border-2 border-ink flex items-center justify-center text-blue-ink shrink-0">
            <BookMarked className="w-5 h-5 stroke-[2.5]" />
          </div>
          <h3 className="text-sm font-extrabold tracking-tight text-black">
            Minha grade
          </h3>
          {selectedClasses.length > 0 ? (
            <Badge variant="neutral" size="sm">
              {selectedClasses.length}
            </Badge>
          ) : null}
          {isDirty && selectedClasses.length > 0 ? (
            <Badge variant="yellow" size="sm">
              Não salva
            </Badge>
          ) : null}
        </div>
        {selectedClasses.length > 0 ? (
          <Button
            type="button"
            variant={confirmingClear ? "destructive" : "outline"}
            size="sm"
            onClick={handleClearClick}
            title={
              confirmingClear
                ? "Clique de novo para confirmar a limpeza"
                : "Remove todas as turmas da grade"
            }
            className="shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
            {confirmingClear ? "Confirmar limpeza" : "Limpar grade"}
          </Button>
        ) : null}
      </div>

      {/* Ações do Gerador Automático de Horários */}
      <div className="pb-4 border-b-2 border-black/15 space-y-3">
        <div className="flex items-end gap-2">
          <FilterSelect
            label="Turno:"
            value={shiftFilter}
            options={SHIFT_OPTIONS}
            active={shiftFilter !== "ALL"}
            onChange={(value) =>
              onShiftFilterChange(value as "ALL" | "M" | "T" | "N")
            }
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onGenerateCombinations}
            disabled={selectedClasses.length === 0 || isSolving}
            isLoading={isSolving}
            className="flex-1"
            title="Troca as turmas de cada disciplina até achar horários sem conflito"
          >
            <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Gerar combinações</span>
          </Button>

          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={onSaveGrade}
            disabled={isSaving}
            isLoading={isSaving}
            title="Salva a grade no seu computador para este semestre"
          >
            <Save className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Salvar grade</span>
          </Button>

        </div>
      </div>

      {selectedClasses.length === 0 ? (
        <div className="py-5 px-4 text-center bg-pastel-blue border-2 border-dashed border-black/25 rounded-lg space-y-1.5">
          <img
            src="/sarue-doubt.png"
            alt=""
            aria-hidden="true"
            className="w-16 h-16 object-contain mx-auto select-none pointer-events-none"
          />
          <p className="text-xs font-extrabold text-black">
            Sua grade está vazia
          </p>
          <p className="text-[11px] font-semibold text-neutral-600">
            Expanda uma disciplina no catálogo acima e adicione a turma que
            quer cursar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {selectedClasses.map((cls) => {
            const color =
              disciplineColorMap.get(cls.disciplineCode) ||
              DISCIPLINE_COLORS[0];
            return (
              <div
                key={cls.id}
                className={`p-2.5 rounded-lg border-2 ${color.border} ${color.bg} flex items-center justify-between gap-2`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-black text-xs text-black">
                      {cls.disciplineCode}
                    </span>
                    <span className="font-black text-xs text-black">
                      (T{cls.classCode} - {cls.scheduleCode})
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-neutral-800 truncate mt-0.5">
                    {cls.disciplineName}
                  </p>
                  <p className="text-[11px] font-semibold text-neutral-600 truncate">
                    {cls.classroom}
                    {cls.scheduleDescription
                      ? ` • ${cls.scheduleDescription}`
                      : ""}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveClass(cls.id)}
                  title="Remover da grade"
                  className="h-9 w-9 text-neo-danger hover:text-neo-dangerHover hover:bg-pastel-red shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
