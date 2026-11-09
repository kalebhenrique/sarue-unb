import React from "react";
import {
  Card,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import { Search, X } from "lucide-react";
import type { Department, SemesterOption } from "@/core";
import { DepartmentSelect } from "./DepartmentSelect";

export interface GradeFiltersProps {
  departments: Department[];
  semesters: SemesterOption[];
  selectedDeptId: string;
  onSelectDeptId: (id: string) => void;
  year: string;
  onSelectYear: (year: string) => void;
  period: string;
  onSelectPeriod: (period: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearch: () => void;
  /** Busca ativa — liga a contagem filtrada no rodape da toolbar. */
  hasSearched?: boolean;
  /** Resultados da busca ativa (contagem filtrada do card). */
  resultCount?: number;
  /** Limpa a busca ativa — link de servico da barra (padrao FeedToolbar). */
  onResetSearch?: () => void;
}

export const GradeFilters: React.FC<GradeFiltersProps> = ({
  departments,
  semesters,
  selectedDeptId,
  onSelectDeptId,
  year,
  onSelectYear,
  period,
  onSelectPeriod,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  hasSearched = false,
  resultCount = 0,
  onResetSearch,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Opções de semestres letivos (foco no semestre atual e no próximo)
  const semesterOptions = React.useMemo(() => {
    if (semesters && semesters.length > 0) {
      return semesters.map((s) => ({
        value: `${s.year}-${s.period}`,
        label: s.label,
      }));
    }
    const stored = `${year}-${period}`;
    return [
      {
        value: stored,
        label: `${year} • ${period === "1" ? "1º semestre" : "2º semestre"}`,
      },
    ];
  }, [semesters, year, period]);

  return (
    <Card className="p-4 space-y-4">
      {/* Cabeçalho da seção de busca */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-ink/10 border-2 border-ink flex items-center justify-center text-blue-ink shrink-0">
            <Search className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold tracking-tight text-black">
              Filtrar turmas da UnB
            </h3>
          </div>
        </div>
      </div>

      {/* Parâmetros da busca: semestre letivo (contexto) + unidade de busca */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
        {/* Semestre letivo: contexto dos dados, vindo do scraping */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="text-xs font-bold text-neutral-700">
            Semestre
          </span>
          <Select
            value={`${year}-${period}`}
            items={semesterOptions}
            onValueChange={(val) => {
              if (!val) return;
              const [y, p] = val.split("-");
              onSelectYear(y);
              onSelectPeriod(p);
            }}
          >
            <SelectTrigger className="w-full lg:w-44">
              <SelectValue placeholder="Semestre">
                {semesterOptions.find((o) => o.value === `${year}-${period}`)
                  ?.label ||
                  semesterOptions[0]?.label ||
                  `${year} • 2º semestre`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {semesterOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Unidade de busca: texto (nome, código ou sigla) e departamento */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-xs font-bold text-neutral-700">
            Disciplina
          </span>
          <div className="flex flex-col lg:flex-row gap-2.5 lg:items-stretch">
            {/* Cavidade composta: campo de texto + escopo de departamento na mesma unidade */}
            <div
              className={`flex-1 min-w-0 flex items-stretch rounded-xl border-2 border-ink ${
                searchQuery.trim() ? "bg-pastel-blue" : "bg-paper"
              } focus-within:ring-2 focus-within:ring-neo-blue transition-[box-shadow]`}
            >
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 stroke-[2.5] pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSearch();
                    }
                  }}
                  placeholder="Ex.: Cálculo 1, C1, CIC0004..."
                  aria-label="Buscar disciplina por código, nome ou sigla"
                  className="w-full bg-transparent pl-9 pr-8 h-9 text-xs font-semibold text-black rounded-l-xl shadow-none focus:outline-hidden placeholder:text-neutral-500"
                />
                {searchQuery ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => {
                            onSearchQueryChange("");
                            inputRef.current?.focus();
                          }}
                          aria-label="Limpar campo de busca"
                          className="cursor-pointer absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-400 hover:text-black hover:bg-black/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue transition-colors duration-150"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      }
                    />
                    <TooltipContent>Limpar busca</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>

              {/* Escopo de departamento */}
              <div className="shrink-0 border-l-2 border-black/15">
                <DepartmentSelect
                  departments={departments}
                  value={selectedDeptId}
                  onChange={onSelectDeptId}
                  bare
                  triggerClassName="w-40 lg:w-52 rounded-r-xl hover:bg-neutral-100 dark:hover:bg-neutral-200"
                />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Contagem filtrada: rodape da toolbar com divisor superior, como no catalogo de Avaliacoes */}
      {hasSearched ? (
        <div
          className="border-t-2 border-black/10 pt-2.5 flex items-center justify-between gap-3"
          aria-live="polite"
        >
          <span className="text-xs font-bold text-neutral-700">
            <strong className="text-black">{resultCount}</strong>{" "}
            {resultCount === 1
              ? "disciplina encontrada"
              : "disciplinas encontradas"}
          </span>
          {onResetSearch ? (
            <button
              type="button"
              onClick={onResetSearch}
              className="cursor-pointer rounded-xs text-xs font-bold text-neutral-500 hover:text-black underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 shrink-0"
            >
              Limpar busca
            </button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
};
