import React, { useState } from "react";
import {
  PageContainer,
  PageHeader,
  Button,
  Card,
  Badge,
  Pagination,
} from "@/components/ui";
import {
  ArrowLeft,
  MapPin,
  ThumbsUp,
  CheckCircle2,
  HelpCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { normalizeDepartmentDisplay } from "@/core";
import { PAGE_SIZE, hasConsensusSeal, type DrillDownSummary } from "./types";
import { ConsensusSeal } from "./ConsensusSeal";
import { ReviewCard } from "./ReviewCard";

export interface EvaluationDrillDownProps {
  icon: LucideIcon;
  title: string;
  relatedLabel: string;
  relatedItems: string[];
  summary: DrillDownSummary;
  onBack: () => void;
}

/**
 * Drill-down de professor: resumo das médias em todas as matérias
 * e lista paginada de relatos sinceros.
 */
export const EvaluationDrillDown: React.FC<EvaluationDrillDownProps> = ({
  icon,
  title,
  relatedLabel,
  relatedItems,
  summary,
  onBack,
}) => {
  const reviews = summary.evaluations;
  const pageCount = Math.max(1, Math.ceil(reviews.length / PAGE_SIZE));
  const [page, setPage] = useState(1);
  const safePage = Math.min(page, pageCount);
  const pageItems = reviews.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // Ao abrir o drill-down de relatos, posiciona o scroll no topo
  React.useEffect(() => {
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "instant" });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const avgDisplay =
    summary.averageDidatica !== null
      ? summary.averageDidatica.toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })
      : "N/A";

  return (
    <PageContainer>
      <PageHeader
        icon={icon}
        title={title}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="cursor-pointer flex items-center gap-1.5 font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Voltar</span>
          </Button>
        }
      />

      {/* Resumo do Professor */}
      <Card className="bg-paper rounded-lg p-6 shadow-neo space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {summary.campuses.map((c) => (
            <Badge key={c} variant="outline" size="sm">
              <MapPin className="w-3 h-3 stroke-[2.5] mr-1" />
              {c}
            </Badge>
          ))}
          {summary.departments.slice(0, 3).map((dept) => (
            <Badge
              key={dept}
              variant="neutral"
              size="sm"
              className="bg-pastel-blue"
            >
              {normalizeDepartmentDisplay(dept)}
            </Badge>
          ))}
          {hasConsensusSeal(summary) && (
            <ConsensusSeal count={summary.evaluationsCount} />
          )}
        </div>

        {/* Indicadores centralizados: faixa única, colunas com divisores */}
        <div className="grid grid-cols-3 divide-x-2 divide-black/10">
          <div className="px-2 text-center">
            <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Didática Média
            </span>
            <span className="flex items-center justify-center gap-1 text-2xl font-black text-black">
              {avgDisplay}
              {summary.averageDidatica !== null && (
                <span className="text-sm font-bold text-neutral-600">/10</span>
              )}
            </span>
            <span className="block text-[11px] font-bold text-neutral-600">
              em todas as disciplinas
            </span>
          </div>

          <div className="px-2 text-center">
            <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Recomendação
            </span>
            <span className="flex items-center justify-center gap-1 text-2xl font-black text-black">
              <ThumbsUp className="w-4 h-4 stroke-[2.5] text-ink-success shrink-0" />
              {summary.recommendationRate}%
            </span>
            <span className="block text-[11px] font-bold text-neutral-600">
              em todas as disciplinas
            </span>
          </div>

          <div className="px-2 text-center">
            <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Relatos
            </span>
            <span className="flex items-center justify-center text-2xl font-black text-black">
              {summary.evaluationsCount}
            </span>
            <span className="block text-[11px] font-bold text-neutral-600">
              no total
            </span>
          </div>
        </div>

        {/* Disciplinas avaliadas */}
        <div className="pt-3 border-t border-black/10">
          <p className="text-xs font-black uppercase tracking-wider text-neutral-600 mb-1.5">
            {relatedLabel} ({relatedItems.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {relatedItems.map((item) => (
              <span
                key={item}
                className="text-xs font-bold bg-neutral-100 px-2.5 py-1 border-2 border-ink rounded-lg"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-3 border-t-2 border-black/10 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 text-ink-success">
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            {summary.recommendYesCount}{" "}
            {summary.recommendYesCount === 1 ? "recomenda" : "recomendam"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-neutral-700">
            <HelpCircle className="w-4 h-4 stroke-[2.5]" />
            {summary.recommendDependeCount}{" "}
            {summary.recommendDependeCount === 1
              ? 'responde "depende"'
              : 'respondem "depende"'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-error">
            <XCircle className="w-4 h-4 stroke-[2.5]" />
            {summary.recommendNoCount}{" "}
            {summary.recommendNoCount === 1
              ? "não recomenda"
              : "não recomendam"}
          </span>
        </div>
      </Card>

      {/* Lista de Relatos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-neutral-600 px-1">
          <span>
            Avaliações registradas ({reviews.length}{" "}
            {reviews.length === 1 ? "relato" : "relatos"})
          </span>
          <span>Ordenado das mais recentes</span>
        </div>

        {pageItems.map((ev) => (
          <ReviewCard key={ev.id} evaluation={ev} detailed />
        ))}

        <Pagination
          page={safePage}
          pageCount={pageCount}
          onPageChange={handlePageChange}
        />

        {/* Botão de redundância para navegação no final da listagem */}
        <div className="flex items-center justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="cursor-pointer flex items-center gap-1.5 font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Voltar</span>
          </Button>
        </div>
      </div>
    </PageContainer>
  );
};
