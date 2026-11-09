import React from "react";
import { Card, Button, Badge, Skeleton } from "@/components/ui";
import {
  ChevronDown,
  ChevronUp,
  User,
  MapPin,
  Clock,
  Calendar,
  LibraryBig,
  Search,
  X,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { ScrapedDiscipline, ScrapedClass } from "@/core";

export interface DisciplineCatalogProps {
  filteredDisciplines: ScrapedDiscipline[];
  selectedClasses: ScrapedClass[];
  expandedDisciplines: Record<string, boolean>;
  onToggleExpand: (code: string) => void;
  onToggleClass: (cls: ScrapedClass) => void;
  hasSearched: boolean;
  activeSearchQuery: string;
  activeDeptId: string;
  departmentsMap?: Map<string, string>;
  isFallbackSearch?: boolean;
  /** Carregando o catalogo da rede — espelha a geometria das linhas com skeleton. */
  isScraping?: boolean;
  /** Erro de scrape com catalogo vazio — painel de erro com retry. */
  catalogError?: string | null;
  onRetryCatalog?: () => void;
  onResetSearch: () => void;
  onSearchAllUnb?: () => void;
}

const getDeptLabel = (name?: string) => {
  if (!name) return "";
  const cleaned = name.replace(/ - BRASÍLIA$/i, "").trim();
  if (cleaned.includes("CAMPUS UNB GAMA")) return "FGA";
  if (cleaned.includes("CAMPUS UNB CEILÂNDIA")) return "FCE";
  if (cleaned.includes("CAMPUS UNB PLANALTINA")) return "FUP";
  return cleaned
    .replace(/^DEPTO\s+/i, "")
    .replace(/^DEPARTAMENTO DE\s+/i, "")
    .replace(/^FACULDADE DE\s+/i, "")
    .replace(/^INSTITUTO DE\s+/i, "");
};

const CATALOG_SKELETON_ROWS = [
  { pill: "w-14", name: "w-3/4", meta: "w-1/3" },
  { pill: "w-16", name: "w-2/3", meta: "w-1/4" },
  { pill: "w-12", name: "w-4/5", meta: "w-2/5" },
  { pill: "w-16", name: "w-3/5", meta: "w-1/3" },
  { pill: "w-14", name: "w-2/3", meta: "w-1/4" },
];

const CatalogSkeleton = () => (
  <div className="p-3 space-y-1 bg-paper" aria-hidden="true">
    {CATALOG_SKELETON_ROWS.map((row, i) => (
      <div key={i} className="p-3.5 border-b-2 border-black/10 last:border-b-0">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className={`h-5 ${row.pill} rounded-full`} />
          <Skeleton className="h-3.5 w-16 rounded-full" />
        </div>
        <Skeleton className={`h-3.5 ${row.name}`} />
        <Skeleton className={`mt-2 h-3 ${row.meta}`} />
      </div>
    ))}
  </div>
);

interface DisciplineRowProps {
  discipline: ScrapedDiscipline;
  isExpanded: boolean;
  isDisciplineSelected: boolean;
  selectedClassIds: Set<string>;
  deptName?: string;
  onToggleExpand: (code: string) => void;
  onToggleClass: (cls: ScrapedClass) => void;
}

/**
 * Linha de disciplina do catálogo, memoizada: re-renderiza só quando a própria
 * disciplina muda de estado (expandida/selecionada) — não quando uma irmã muda.
 */
const DisciplineRow = React.memo<DisciplineRowProps>(function DisciplineRow({
  discipline,
  isExpanded,
  isDisciplineSelected,
  selectedClassIds,
  deptName,
  onToggleExpand,
  onToggleClass,
}) {
  const deptShort = getDeptLabel(deptName);
  return (
    <div className="transition-colors">
      {/* Cabeçalho da Disciplina (clicável para expandir) */}
      <button
        type="button"
        onClick={() => onToggleExpand(discipline.code)}
        aria-expanded={isExpanded}
        className="cursor-pointer w-full text-left p-3.5 flex items-start justify-between gap-3 hover:bg-neutral-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-[11px] font-black bg-paper border border-ink rounded-md px-2 py-0.5">
              {discipline.code}
            </span>
            <span className="text-[11px] font-bold text-neutral-600">
              {discipline.classes.length}{" "}
              {discipline.classes.length === 1 ? "turma" : "turmas"}
            </span>
            {isDisciplineSelected ? (
              <Badge variant="success" size="sm">
                Na Grade
              </Badge>
            ) : null}
            {deptShort ? (
              <span
                className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider truncate max-w-[200px]"
                title={deptName}
              >
                • {deptShort}
              </span>
            ) : null}
          </div>
          <h4 className="text-xs font-black text-black leading-snug">
            {discipline.name}
          </h4>
        </div>

        <div className="p-1 rounded-lg hover:bg-neutral-200/60 shrink-0 mt-0.5">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 stroke-[2.5]" />
          ) : (
            <ChevronDown className="w-4 h-4 stroke-[2.5]" />
          )}
        </div>
      </button>

      {/* Turmas Ofertadas (quando expandido) */}
      {isExpanded ? (
        <div className="p-3 bg-neutral-50 border-t-2 border-black/10 space-y-2.5">
          {discipline.classes.map((cls) => (
            <ClassCard
              key={cls.id}
              cls={cls}
              isSelected={selectedClassIds.has(cls.id)}
              onToggle={() => onToggleClass(cls)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
});

interface ClassCardProps {
  cls: ScrapedClass;
  isSelected: boolean;
  onToggle: () => void;
}

/**
 * Card de turma dentro da disciplina expandida. Memoizado para o toggle de
 * uma turma não re-renderizar as outras turmas abertas.
 */
const ClassCard = React.memo<ClassCardProps>(function ClassCard({
  cls,
  isSelected,
  onToggle,
}) {
  return (
    <div
      className={`p-3 rounded-lg border-2 transition-[transform,box-shadow,background-color,border-color] ${
        isSelected
          ? "border-ink bg-pastel-green shadow-[2px_2px_0px_0px_var(--neo-shadow)]"
          : "border-black/25 bg-paper"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-black text-black">
            Turma {cls.classCode}
          </span>
          {cls.dateRange ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-md border border-black/20">
              <Calendar className="w-2.5 h-2.5 text-neutral-500 shrink-0" />
              {cls.dateRange}
            </span>
          ) : null}
        </div>
        <Badge variant="neutral" size="sm" className="font-mono text-xs">
          {cls.scheduleCode}
        </Badge>
      </div>

      <div className="space-y-1 text-[11px] font-medium text-neutral-700">
        <div className="flex items-center gap-1.5 truncate">
          <User className="w-3 h-3 text-neutral-500 shrink-0" />
          <span className="truncate">{cls.teachers.join(", ")}</span>
        </div>
        <div className="flex items-center gap-1.5 truncate">
          <MapPin className="w-3 h-3 text-neutral-500 shrink-0" />
          <span className="truncate">{cls.classroom}</span>
        </div>
        {cls.scheduleDescription ? (
          <div className="flex items-center gap-1.5 text-neutral-700 font-medium">
            <Clock className="w-3 h-3 text-neutral-500 shrink-0" />
            <span className="truncate text-[11px]">
              {cls.scheduleDescription}
            </span>
          </div>
        ) : null}
      </div>

      <div className="pt-2 mt-2 border-t border-black/10 flex items-center justify-between">
        {(() => {
          const rawOcc = cls.occupied ?? 0;
          const rawVac = cls.vacancies ?? 0;
          const hasRealVac = rawVac > 0;
          const occupied = hasRealVac ? rawOcc : 0;
          const vacancies = hasRealVac ? rawVac : rawOcc;

          return (
            <span className="text-[11px] font-bold text-neutral-600">
              {hasRealVac
                ? `Vagas: ${occupied}/${vacancies}`
                : vacancies > 0
                  ? `Vagas: ${vacancies} ofertadas`
                  : "Vagas a definir"}
            </span>
          );
        })()}

        <Button
          type="button"
          variant={isSelected ? "destructive" : "primary"}
          size="sm"
          onClick={onToggle}
          aria-pressed={isSelected}
          className="h-7 px-3 text-[11px] rounded-lg"
        >
          {isSelected ? "Remover" : "+ Adicionar"}
        </Button>
      </div>
    </div>
  );
});

export const DisciplineCatalog: React.FC<DisciplineCatalogProps> = ({
  filteredDisciplines,
  selectedClasses,
  expandedDisciplines,
  onToggleExpand,
  onToggleClass,
  hasSearched,
  activeSearchQuery,
  activeDeptId,
  departmentsMap,
  isFallbackSearch = false,
  isScraping = false,
  catalogError = null,
  onRetryCatalog,
  onResetSearch,
  onSearchAllUnb,
}) => {
  // Set de ids das turmas na grade: lookup O(1) por linha memoizada
  const selectedClassIds = React.useMemo(
    () => new Set(selectedClasses.map((c) => c.id)),
    [selectedClasses],
  );

  return (
    <Card className="overflow-hidden p-0">
      {/* Header do Catálogo */}
      <div className="px-4 py-3 border-b-2 border-ink flex items-center justify-between gap-3 bg-paper">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-ink/10 border-2 border-ink flex items-center justify-center text-blue-ink shrink-0">
            <LibraryBig className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold tracking-tight text-black whitespace-nowrap">
              Catálogo de disciplinas
            </h3>
          </div>
        </div>

        {/* Botão de limpar busca quando houver busca ativa */}
        {hasSearched && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetSearch}
            className="text-xs text-neutral-600 hover:text-black h-7 px-2"
          >
            <X className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">Limpar busca</span>
          </Button>
        )}
      </div>

      {/* Alerta de fallback quando disciplina não foi achada no departamento escolhido */}
      {hasSearched && isFallbackSearch && (
        <div className="px-4 py-2.5 bg-pastel-yellow border-b-2 border-black/10 flex items-center gap-2 text-xs font-semibold text-neutral-800">
          <Sparkles className="w-4 h-4 text-black shrink-0" />
          <span>
            Não encontramos "{activeSearchQuery}" em{" "}
            <strong>{departmentsMap?.get(activeDeptId) || activeDeptId}</strong>
            . Mostrando resultados de outros departamentos da UnB.
          </span>
        </div>
      )}

      {/* Barra de escopo quando departamento específico está selecionado (sem fallback) */}
      {hasSearched &&
        !isFallbackSearch &&
        activeDeptId &&
        activeDeptId !== "ALL" && (
          <div className="px-4 py-2 bg-neutral-50 border-b-2 border-black/10 flex items-center justify-between text-xs font-semibold text-neutral-700">
            <span className="truncate">
              Filtrando departamento:{" "}
              <strong className="text-black">
                {departmentsMap?.get(activeDeptId) || activeDeptId}
              </strong>
            </span>
            {onSearchAllUnb && (
              <button
                type="button"
                onClick={onSearchAllUnb}
                className="text-xs font-extrabold text-blue-ink underline decoration-2 underline-offset-2 hover:opacity-80 cursor-pointer shrink-0 ml-2"
              >
                Buscar em toda a UnB
              </button>
            )}
          </div>
        )}

      {/* Dica para busca geral UnB sem termo de texto */}
      {hasSearched && activeDeptId === "ALL" && !activeSearchQuery && (
        <div className="px-4 py-2 bg-pastel-blue border-b-2 border-black/10 text-[11px] font-semibold text-neutral-700 flex items-center justify-between">
          <span>
            Mostrando as primeiras {filteredDisciplines.length} disciplinas da
            UnB. Digite o nome acima para refinar.
          </span>
        </div>
      )}

      {/* Conteúdo: estado inicial (antes de buscar) OU sem resultados OU lista de disciplinas */}
      {!hasSearched ? (
        <div className="p-8 text-center bg-paper space-y-3">
          <div className="w-12 h-12 mx-auto bg-pastel-blue border-2 border-ink rounded-2xl flex items-center justify-center">
            <Search className="w-6 h-6 stroke-[2.5] text-blue-ink" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-extrabold text-black">
              Pesquise turmas da UnB
            </p>
            <p className="text-xs font-semibold text-neutral-600 max-w-sm mx-auto">
              Digite o nome, código ou sigla da matéria, escolha um
              departamento, ou clique em <strong>Buscar</strong> para listar
              tudo.
            </p>
          </div>
        </div>
      ) : filteredDisciplines.length === 0 && isScraping ? (
        <CatalogSkeleton />
      ) : filteredDisciplines.length === 0 && catalogError ? (
        <div className="p-8 text-center bg-paper space-y-2">
          <img
            src="/sarue-doubt.png"
            alt=""
            aria-hidden="true"
            className="w-16 h-16 object-contain mx-auto select-none pointer-events-none"
          />
          <p className="text-xs font-extrabold text-black">
            Não conseguimos carregar as turmas
          </p>
          <p className="text-[11px] font-semibold text-neutral-600 max-w-xs mx-auto">
            Ocorreu um problema ao buscar o catálogo da UnB. Verifique sua
            conexão e tente de novo.
          </p>
          <div className="pt-2 flex justify-center">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onRetryCatalog}
            >
              <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : filteredDisciplines.length === 0 ? (
        <div className="p-8 text-center bg-paper space-y-2">
          <div className="w-10 h-10 mx-auto bg-pastel-blue border-2 border-ink rounded-xl shadow-[2px_2px_0px_0px_var(--neo-shadow)] flex items-center justify-center">
            <Search className="w-4 h-4 stroke-[2.5] text-blue-ink" />
          </div>
          <p className="text-xs font-extrabold text-black">
            Nenhuma disciplina encontrada
          </p>
          <p className="text-[11px] font-semibold text-neutral-600 max-w-xs mx-auto">
            {activeSearchQuery
              ? `Nenhuma disciplina corresponde a "${activeSearchQuery}". Tente parte do nome ou código (ex.: APC, Cálculo).`
              : "Nenhuma turma encontrada para os filtros selecionados."}
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            {activeDeptId && activeDeptId !== "ALL" && onSearchAllUnb && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSearchAllUnb}
              >
                Pesquisar em toda a UnB
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetSearch}
            >
              Limpar busca
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-h-[560px] overflow-y-auto divide-y-2 divide-black/10 bg-paper">
          {filteredDisciplines.map((discipline) => (
            <DisciplineRow
              key={discipline.code}
              discipline={discipline}
              isExpanded={expandedDisciplines[discipline.code] ?? false}
              isDisciplineSelected={selectedClasses.some(
                (c) => c.disciplineCode === discipline.code,
              )}
              selectedClassIds={selectedClassIds}
              deptName={departmentsMap?.get(discipline.departmentId)}
              onToggleExpand={onToggleExpand}
              onToggleClass={onToggleClass}
            />
          ))}
        </div>
      )}
    </Card>
  );
};
