import React from "react";
import type { FlowchartDiscipline } from "@/core";
import { CircleDotDashed } from "lucide-react";
import { FlowchartCard } from "./FlowchartCard";

export interface CurrentlyEnrolledPanelProps {
  disciplines: FlowchartDiscipline[];
  /** Busca ativa na página: cards sem correspondência ficam esmaecidos */
  searchQuery?: string;
}

const norm = (v: string) =>
  v
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Painel "Cursando agora": leitura (dashboard) — concluir disciplina acontece na lista/fluxograma
export const CurrentlyEnrolledPanel: React.FC<CurrentlyEnrolledPanelProps> =
  React.memo(({ disciplines, searchQuery = "" }) => {
    const query = norm(searchQuery.trim());
    const matches = (d: FlowchartDiscipline) =>
      query === "" ||
      norm(d.code).includes(query) ||
      norm(d.name).includes(query);
    const matchCount = disciplines.filter(matches).length;

    return (
      <div
        className="bg-pastel-blue border-2 border-ink rounded-lg p-4 shadow-neo-sm md:shadow-neo mb-6"
        aria-live="polite"
      >
        <div className="flex items-baseline gap-2 mb-3">
          <CircleDotDashed className="w-4 h-4 stroke-[2.5] text-blue-ink self-center shrink-0" />
          <h3 className="font-black text-sm text-black">Cursando agora</h3>
          <span className="text-[11px] font-bold text-neutral-600">
            {query !== ""
              ? `${matchCount} de ${disciplines.length} correspondem à busca`
              : `${disciplines.length} disciplinas neste semestre`}
          </span>
        </div>

        {disciplines.length === 0 ? (
          <p className="text-xs font-bold text-neutral-700 py-2">
            Nenhuma disciplina matriculada neste semestre — sincronize o SIGAA
            para atualizar seu histórico.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {disciplines.map((d) => (
              <div key={d.code} className={matches(d) ? "" : "opacity-40"}>
                <FlowchartCard discipline={d} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  });
