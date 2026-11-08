import React from 'react';
import { Card, Badge } from '@/components/ui';
import {
  BookOpen,
  Users,
  Building2,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampusName, ProfessorSummary, DisciplineSummary } from '@/core';
import { hasConsensusSeal } from './types';
import { ConsensusSeal } from './ConsensusSeal';

/** Card clicável do catálogo (@DESIGN.md "Card clicável"): sombra token
 * shadow-neo, física de afundar na escala 4px e semântica de botão. */
export const ClickableCard: React.FC<{
  onClick: () => void;
  'aria-label': string;
  className?: string;
  children: React.ReactNode;
}> = ({ onClick, 'aria-label': ariaLabel, className, children }) => (
  <Card
    onClick={onClick}
    role="button"
    tabIndex={0}
    aria-label={ariaLabel}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }}
    className={cn(
      'cursor-pointer bg-paper rounded-lg shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo-sm active:translate-x-[4px] active:translate-y-[4px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out group',
      className
    )}
  >
    {children}
  </Card>
);

export interface CatalogSummaryCardProps {
  title: string;
  campuses: CampusName[];
  hasConsensus: boolean;
  averageDidatica?: number | null;
  evaluationsCount: number;
  recommendationRate: number;
  departments: string[];
  secondaryIcon: LucideIcon;
  secondaryItems: string[];
  onClick: () => void;
}

/** Card base reutilizável para exibição de resumos no catálogo (docentes ou disciplinas). */
export const CatalogSummaryCard: React.FC<CatalogSummaryCardProps> = ({
  title,
  campuses,
  hasConsensus,
  evaluationsCount,
  recommendationRate,
  departments,
  secondaryIcon: SecondaryIcon,
  secondaryItems,
  onClick,
}) => {
  return (
    <ClickableCard
      onClick={onClick}
      aria-label={`Ver ${evaluationsCount} avaliações de ${title}`}
      className="p-6 flex flex-col justify-between"
    >
      <div>
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          {campuses.map((c) => (
            <Badge key={c} variant="outline" size="sm">
              {c}
            </Badge>
          ))}
          {hasConsensus && <ConsensusSeal count={evaluationsCount} />}
        </div>

        <h3 className="text-sm md:text-base font-black text-black leading-snug mb-2 group-hover:text-blue-ink transition-colors">
          {title}
        </h3>

        <div className="space-y-1.5 text-xs font-medium text-neutral-700">
          <div className="flex items-center gap-2">
            <SecondaryIcon className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5] shrink-0" />
            <span className="truncate">
              {secondaryItems.slice(0, 2).join(', ')}
              {secondaryItems.length > 2
                ? ` (+${secondaryItems.length - 2})`
                : ''}
            </span>
          </div>

          {departments.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5] shrink-0" />
              <span className="truncate">
                {departments.slice(0, 2).join(' • ')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-4 border-t-2 border-black/10 mt-4 text-xs font-bold">
        <span className="inline-flex items-center gap-1.5 text-neutral-700">
          <ThumbsUp className="w-3.5 h-3.5 stroke-[2.5] text-ink-success" />
          {recommendationRate}% recomendam
          <span className="text-neutral-500">·</span>
          {evaluationsCount} {evaluationsCount === 1 ? 'relato' : 'relatos'}
        </span>
        <span className="text-neutral-800 text-[11px] underline decoration-2 group-hover:text-blue-ink font-extrabold">
          Ver relatos →
        </span>
      </div>
    </ClickableCard>
  );
};

export const ProfessorCatalogCard: React.FC<{
  prof: ProfessorSummary;
  onClick: () => void;
}> = ({ prof, onClick }) => (
  <CatalogSummaryCard
    title={prof.professorName}
    campuses={prof.campuses}
    hasConsensus={hasConsensusSeal(prof)}
    averageDidatica={prof.averageDidatica}
    evaluationsCount={prof.evaluationsCount}
    recommendationRate={prof.recommendationRate}
    departments={prof.departments}
    secondaryIcon={BookOpen}
    secondaryItems={prof.disciplines}
    onClick={onClick}
  />
);

export const DisciplineCatalogCard: React.FC<{
  disc: DisciplineSummary;
  onClick: () => void;
}> = ({ disc, onClick }) => (
  <CatalogSummaryCard
    title={disc.disciplineName}
    campuses={disc.campuses}
    hasConsensus={hasConsensusSeal(disc)}
    averageDidatica={disc.averageDidatica}
    evaluationsCount={disc.evaluationsCount}
    recommendationRate={disc.recommendationRate}
    departments={disc.departments}
    secondaryIcon={Users}
    secondaryItems={disc.professors}
    onClick={onClick}
  />
);

/** Card compacto de professor dentro do drill-down de disciplina. */
export const DisciplineProfessorCard: React.FC<{
  prof: ProfessorSummary;
  onOpen: (prof: ProfessorSummary) => void;
}> = ({ prof, onOpen }) => {
  return (
    <ClickableCard
      onClick={() => onOpen(prof)}
      aria-label={`Ver ${prof.evaluationsCount} relatos de ${prof.professorName}`}
      className="p-4 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {hasConsensusSeal(prof) && (
            <ConsensusSeal count={prof.evaluationsCount} />
          )}
        </div>
        <h3 className="text-sm md:text-base font-black text-black leading-snug truncate group-hover:text-blue-ink transition-colors">
          {prof.professorName}
        </h3>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-700 mt-1">
          <ThumbsUp className="w-3.5 h-3.5 stroke-[2.5] text-ink-success" />
          {prof.recommendationRate}% recomendam
          <span className="text-neutral-500">·</span>
          {prof.evaluationsCount}{' '}
          {prof.evaluationsCount === 1 ? 'relato' : 'relatos'}
        </span>
      </div>
    </ClickableCard>
  );
};
