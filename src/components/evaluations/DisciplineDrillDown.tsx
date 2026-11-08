import React from 'react';
import {
  PageContainer,
  PageHeader,
  Button,
  Card,
  Badge,
} from '@/components/ui';
import {
  ArrowLeft,
  MapPin,
  MessageSquareQuote,
  ThumbsUp,
  CheckCircle2,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import {
  normalizeDepartmentDisplay,
  type DisciplineSummary,
  type ProfessorSummary,
} from '@/core';
import { hasConsensusSeal } from './types';
import { ConsensusSeal } from './ConsensusSeal';
import { DisciplineProfessorCard } from './CatalogCards';

export interface DisciplineDrillDownProps {
  summary: DisciplineSummary;
  professorSummaries: ProfessorSummary[];
  initialScrollTop?: number;
  onBack: () => void;
  onOpenProfessor: (prof: ProfessorSummary) => void;
}

/**
 * Drill-down de disciplina: card-resumo com médias ENTRE professores
 * e a grade de cards de professores, que abrem os relatos de cada um.
 */
export const DisciplineDrillDown: React.FC<DisciplineDrillDownProps> = ({
  summary,
  professorSummaries,
  initialScrollTop,
  onBack,
  onOpenProfessor,
}) => {
  // Posiciona o scroll no topo (ou restaura a posição caso venha de um retorno)
  React.useEffect(() => {
    const target = initialScrollTop ?? 0;
    const mainEl = document.querySelector('main');
    const restore = () => {
      if (mainEl) {
        mainEl.scrollTo({ top: target, behavior: 'instant' });
      }
      window.scrollTo({ top: target, behavior: 'instant' });
    };
    restore();
    const rafId = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(rafId);
  }, [initialScrollTop]);

  const didaticas = professorSummaries
    .map((p) => p.averageDidatica)
    .filter((v): v is number => v !== null);
  const mediaDidatica: number | null =
    didaticas.length > 0
      ? Math.round(
          (didaticas.reduce((a, v) => a + v, 0) / didaticas.length) * 10
        ) / 10
      : summary.averageDidatica;
  const mediaRecomendacao =
    professorSummaries.length > 0
      ? Math.round(
          professorSummaries.reduce((a, p) => a + p.recommendationRate, 0) /
            professorSummaries.length
        )
      : summary.recommendationRate;

  const mediaStr =
    mediaDidatica !== null
      ? mediaDidatica.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
      : 'N/A';

  return (
    <PageContainer>
      <PageHeader
        icon={MessageSquareQuote}
        title={summary.disciplineName}
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

      {/* Resumo da disciplina */}
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

        {/* Painel de indicadores: faixa única, colunas com divisores finos */}
        <div className="grid grid-cols-3 divide-x-2 divide-black/10">
          <div className="px-2 text-center">
            <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Didática Média
            </span>
            <span className="flex items-center justify-center gap-1 text-2xl font-black text-black">
              {mediaStr}
              {mediaDidatica !== null && (
                <span className="text-sm font-bold text-neutral-600">/10</span>
              )}
            </span>
            <span className="block text-[11px] font-bold text-neutral-600">
              entre {professorSummaries.length} professores
            </span>
          </div>

          <div className="px-2 text-center">
            <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Recomendação
            </span>
            <span className="flex items-center justify-center gap-1 text-2xl font-black text-black">
              <ThumbsUp className="w-4 h-4 stroke-[2.5] text-ink-success shrink-0" />
              {mediaRecomendacao}%
            </span>
            <span className="block text-[11px] font-bold text-neutral-600">
              entre professores
            </span>
          </div>

          <div className="px-2 text-center">
            <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Relatos
            </span>
            <span className="text-2xl font-black text-black">
              {summary.evaluationsCount}
            </span>
            <span className="block text-[11px] font-bold text-neutral-600">
              no total
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-3 border-t-2 border-black/10 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 text-ink-success">
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            {summary.recommendYesCount}{' '}
            {summary.recommendYesCount === 1 ? 'recomenda' : 'recomendam'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-neutral-700">
            <HelpCircle className="w-4 h-4 stroke-[2.5]" />
            {summary.recommendDependeCount}{' '}
            {summary.recommendDependeCount === 1
              ? 'responde "depende"'
              : 'respondem "depende"'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-error">
            <XCircle className="w-4 h-4 stroke-[2.5]" />
            {summary.recommendNoCount}{' '}
            {summary.recommendNoCount === 1
              ? 'não recomenda'
              : 'não recomendam'}
          </span>
        </div>
      </Card>

      {/* Professores da disciplina */}
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-wider text-neutral-600 px-1">
          Professores desta disciplina ({professorSummaries.length})
        </p>
        {professorSummaries.length === 0 ? (
          <p className="text-xs font-bold text-neutral-600 px-1">
            Não foi possível relacionar professores a esta disciplina.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {professorSummaries.map((prof) => (
              <DisciplineProfessorCard
                key={prof.professorKey}
                prof={prof}
                onOpen={onOpenProfessor}
              />
            ))}
          </div>
        )}

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
