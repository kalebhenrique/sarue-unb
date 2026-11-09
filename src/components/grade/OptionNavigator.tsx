import React from 'react';
import { Button } from '@/components/ui';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

export interface OptionNavigatorProps {
  optionsCount: number;
  currentIndex: number;
  onApplyOption: (index: number) => void;
}

/**
 * Faixa de navegação entre combinações geradas pelo solver.
 * Fica no topo da coluna de resultado, junto da grade que ela atualiza.
 */
export const OptionNavigator: React.FC<OptionNavigatorProps> = ({
  optionsCount,
  currentIndex,
  onApplyOption,
}) => {
  return (
    <div className="bg-pastel-yellow border-2 border-ink rounded-lg shadow-(--neo-card-shadow) p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-1.5 bg-paper border-2 border-ink rounded-lg shadow-[2px_2px_0px_0px_var(--neo-shadow)] shrink-0">
          <Sparkles className="w-4 h-4 stroke-[2.5] text-blue-ink" />
        </div>
        <div className="min-w-0" aria-live="polite">
          <p className="text-xs font-extrabold text-black tracking-tight">
            {optionsCount}{" "}
            {optionsCount === 1
              ? "opção sem conflito gerada"
              : "opções sem conflito geradas"}
          </p>
          <p className="text-[11px] font-semibold text-neutral-600 mt-0.5">
            Navegue entre as opções — a grade abaixo atualiza na hora.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 bg-paper border-2 border-ink rounded-xl p-1 shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={currentIndex === 0}
          onClick={() => onApplyOption(currentIndex - 1)}
          title="Opção anterior"
          aria-label="Ver opção anterior"
          className="h-9 w-9 rounded-lg"
        >
          <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
        </Button>

        <span className="text-xs font-black text-blue-ink px-1 whitespace-nowrap">
          Opção {currentIndex + 1} de {optionsCount}
        </span>

        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={currentIndex === optionsCount - 1}
          onClick={() => onApplyOption(currentIndex + 1)}
          title="Próxima opção"
          aria-label="Ver próxima opção"
          className="h-9 w-9 rounded-lg"
        >
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
        </Button>
      </div>
    </div>
  );
};
