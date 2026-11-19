import React from "react";
import type { FlowchartDiscipline } from "@/core";

export interface FlowchartCardProps {
  discipline: FlowchartDiscipline;
}

// Card somente leitura do painel "Cursando agora": código, carga e nome.
// Concluir disciplina acontece na lista (FlowchartList); o painel já declara o estado.
export const FlowchartCard: React.FC<FlowchartCardProps> = React.memo(
  ({ discipline }) => {
    return (
      <div className="border-2 border-ink rounded-lg p-3 flex flex-col justify-between gap-2 bg-paper select-none min-h-24">
        <h4
          className="text-sm font-medium leading-snug line-clamp-2 text-black"
          title={discipline.name}
        >
          {discipline.name}
        </h4>

        <span className="text-xs font-medium text-neutral-600 truncate">
          {discipline.code} • {discipline.workloadHours}h
        </span>
      </div>
    );
  },
);
