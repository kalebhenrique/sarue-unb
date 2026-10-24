import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useProfessorEvaluations } from '../hooks/useProfessorEvaluations';
import { useContainer } from '../context/ContainerContext';
import { subscribeToSyncComplete } from '../context/SyncContext';
import { resolveCourseIdForProfile } from '../hooks/useMyCourse';
import {
  Card,
  Badge,
  PageContainer,
  PageHeader,
  Button,
  Pagination,
  EmptyState,
  Skeleton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Alert,
  Switch,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui';
import {
  Star,
  Search,
  ExternalLink,
  RefreshCw,
  BookOpen,
  MapPin,
  Building2,
  ThumbsUp,
  MessageSquareQuote,
  ArrowLeft,
  Users,
  CheckCircle2,
  HelpCircle,
  XCircle,
  ClipboardCheck,
  GraduationCap,
  Medal,
  ChevronDown,
  CloudOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import { openExternalUrl } from '../lib/utils';
import {
  CONSENSUS_SEAL_MIN_EVALUATIONS,
  normalizeText,
  PROFESSOR_EVALUATIONS_SHEET_URL,
  type CampusName,
  type RecommendationType,
  type DifficultyLevel,
  type ProfessorEvaluationSortBy,
  type ProfessorEvaluation,
  type ProfessorSummary,
  type DisciplineSummary,
  type CurriculumStructure,
} from '@/core';

type EvaluationViewMode = 'professors' | 'disciplines';

let cachedEvaluationViewMode: EvaluationViewMode = 'professors';

const PAGE_SIZE = 20;

function getDidaticaBadgeStyle(score: number | null): string {
  if (score === null) {
    return 'bg-neutral-100 text-neutral-700 border-black';
  }
  if (score >= 8) {
    return 'bg-neo-green text-black border-black';
  }
  if (score >= 6) {
    return 'bg-neo-yellow text-black border-black';
  }
  return 'bg-neo-danger text-white border-black';
}

/** Cor do card de didática inteiro, por faixa de nota. */
function getDidaticaCardStyle(score: number | null): string {
  if (score === null) {
    return 'bg-neutral-100 text-neutral-700';
  }
  if (score >= 8) {
    return 'bg-neo-green text-black';
  }
  if (score >= 6) {
    return 'bg-neo-yellow text-black';
  }
  return 'bg-neo-danger text-white';
}

function getRecommendationBadge(rec: RecommendationType) {
  if (rec === 'sim') {
    return (
      <Badge variant="success" size="sm">
        Recomenda
      </Badge>
    );
  }
  if (rec === 'depende') {
    return (
      <Badge variant="yellow" size="sm" title="Recomendaria, mas com ressalvas">
        Depende
      </Badge>
    );
  }
  return (
    <Badge variant="urgent" size="sm">
      Não recomenda
    </Badge>
  );
}

// Labels resolvidos pela prop `items` do Select (Base UI) para que o valor
// selecionado apareça em pt-BR mesmo antes do popup ser montado.
const difficultyFilterItems: Record<string, string> = {
  all: 'Todas as dificuldades',
  muito_facil: 'Muito fácil',
  facil: 'Fácil',
  medio: 'Médio',
  dificil: 'Difícil',
  muito_dificil: 'Muito difícil',
  nivel_god: 'Nível God',
};

const sortItems: Record<string, string> = {
  recommendation_desc: 'Mais recomendados',
  rating_desc: 'Maior didática (10 → 0)',
  rating_asc: 'Menor didática (0 → 10)',
  reviews_desc: 'Mais avaliados',
};

const campusFilterItems: Record<string, string> = {
  all: 'Todos os campi',
  'Darcy Ribeiro': 'Darcy Ribeiro',
  'Ceilândia': 'Ceilândia',
  'Gama': 'Gama',
  'Planaltina': 'Planaltina',
};

/** Selo exige muitas avaliações E consenso confirmado entre os relatos. */
function hasConsensusSeal(summary: {
  hasConsistentLevels?: boolean;
  evaluationsCount: number;
}): boolean {
  return (
    Boolean(summary.hasConsistentLevels) &&
    summary.evaluationsCount >= CONSENSUS_SEAL_MIN_EVALUATIONS
  );
}

/** Normaliza nomes de departamento: remove prefixos e padroniza a inicial. */
function normalizeDepartmentName(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/^(departamento|depto|dep)\.?\s+(de\s+)?/i, '')
    .replace(/\s*[-–]\s*[a-z]{2,4}\s*$/i, '')
    .trim();
  if (!cleaned) return raw.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const ConsensusSeal: React.FC<{ count: number }> = ({ count }) => {
  const hint = `A comunidade converge: a partir de ${count} relatos com nível de dificuldade parecido.`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="yellow"
            size="sm"
            aria-label={hint}
            tabIndex={0}
            className="cursor-help focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2"
          >
            <Medal className="w-3 h-3 stroke-[2.5] shrink-0" />
            Consenso da comunidade
          </Badge>
        }
      />
      <TooltipContent className="max-w-72 leading-relaxed text-left">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
};

const ReviewCard: React.FC<{
  evaluation: ProfessorEvaluation;
  /** Drill-down habilita "Mais detalhes" com os campos de curiosidade pós-decisão. */
  detailed?: boolean;
}> = ({ evaluation, detailed = false }) => {
  const [showDetails, setShowDetails] = useState(false);

  const scoreDisplay =
    evaluation.didaticaScore !== null
      ? evaluation.didaticaScore.toLocaleString('pt-BR', {
          maximumFractionDigits: 1,
        })
      : 'N/A';

  const detailFields = [
    { label: 'Monitoria', value: evaluation.hasMonitor },
    { label: 'Importa-se', value: evaluation.caresAboutStudents },
    { label: 'Aprendizado', value: evaluation.learnedContent },
    { label: 'Resultado', value: evaluation.outcome },
  ].filter((d) => d.value);

  const showModality =
    evaluation.modality && normalizeText(evaluation.modality) !== 'PRESENCIAL';

  // Parâmetros em linha, com rótulos onde o valor não é autoexplicativo.
  const parameters = [
    evaluation.difficulty
      ? { label: 'Dificuldade:', value: evaluation.difficulty }
      : null,
    evaluation.workload ? { label: 'Carga:', value: evaluation.workload } : null,
    evaluation.material ? { label: '', value: evaluation.material } : null,
    evaluation.attendance
      ? { label: '', value: evaluation.attendance }
      : null,
  ].filter((p): p is { label: string; value: string } => p !== null);

  return (
    <Card className="bg-white rounded-lg p-6 shadow-neo space-y-4">
      {/* Cabeçalho: Recomendação, SIGAA e Campus */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {getRecommendationBadge(evaluation.recommendation)}
            <Badge variant="outline" size="sm">
              {evaluation.campus}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-neutral-600">
            <span className="inline-flex items-center gap-1.5 text-base font-black text-black">
              <BookOpen className="w-3.5 h-3.5 stroke-[2.5] text-neutral-500 shrink-0" />
              <span>{evaluation.discipline}</span>
            </span>
            {evaluation.department && (
              <>
                <span className="text-neutral-500">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 stroke-[2.5] text-neutral-500 shrink-0" />
                  <span>{normalizeDepartmentName(evaluation.department)}</span>
                </span>
              </>
            )}
            {evaluation.semester && evaluation.semester !== '-' && (
              <>
                <span className="text-neutral-500">·</span>
                <span>{evaluation.semester}</span>
              </>
            )}
            {showModality && (
              <>
                <span className="text-neutral-500">·</span>
                <span>{evaluation.modality}</span>
              </>
            )}
          </div>
        </div>

        {/* Bloco Adesivo de Nota da Didática: cor única por faixa */}
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border-2 border-black shadow-neo-xs shrink-0 ${getDidaticaCardStyle(
            evaluation.didaticaScore
          )}`}
        >
          <span className="text-[9px] font-black uppercase tracking-wider opacity-80">
            Didática
          </span>
          <span className="inline-flex items-center gap-1 text-base font-black">
            <Star className="w-3.5 h-3.5 stroke-[2.5] fill-current shrink-0" />
            {scoreDisplay}
            {evaluation.didaticaScore !== null && (
              <span className="text-[10px] font-bold opacity-80">/10</span>
            )}
          </span>
        </div>
      </div>

      {/* Feedback sincero em destaque */}
      {evaluation.feedback ? (
        <div className="bg-cream border-2 border-black rounded-lg p-3.5 shadow-neo-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-neutral-600 mb-1">
            <MessageSquareQuote className="w-3.5 h-3.5 stroke-[2.5] text-neo-blue shrink-0" />
            <span>Feedback Sincero</span>
          </div>
          <p className="text-sm font-medium text-black whitespace-pre-line leading-relaxed">
            {evaluation.feedback}
          </p>
        </div>
      ) : null}

      {/* Parâmetros da disciplina em linha, separados para leitura clara */}
      {parameters.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-black">
          {parameters.map((p, i) => (
            <React.Fragment key={`${p.label}-${p.value}-${i}`}>
              {i > 0 && <span className="text-neutral-500">·</span>}
              <span>
                {p.label && (
                  <span className="text-neutral-600">{p.label} </span>
                )}
                {p.value}
              </span>
            </React.Fragment>
          ))}
        </p>
      )}

      {/* Rodapé: método de avaliação + data; curiosidades ficam atrás de disclosure */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t-2 border-black/10 text-xs font-semibold text-neutral-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {evaluation.evaluationMethods && (
            <span className="inline-flex items-center gap-1">
              <ClipboardCheck className="w-3.5 h-3.5 stroke-[2.5] text-neutral-500" />
              <strong className="font-bold text-black">Avaliação:</strong>{' '}
              {evaluation.evaluationMethods}
            </span>
          )}
          {evaluation.timestamp && (
            <span className="text-[11px] font-bold text-neutral-600">
              {evaluation.timestamp.split(' ')[0]}
            </span>
          )}
          {detailed && detailFields.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="ml-auto cursor-pointer inline-flex items-center gap-1 text-xs font-bold text-neutral-600 hover:text-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue rounded-xs"
            >
              {showDetails ? 'Menos detalhes' : 'Mais detalhes'}
              <ChevronDown
                className={`w-3.5 h-3.5 stroke-[2.5] transition-transform duration-150 ease-out ${
                  showDetails ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {detailed && showDetails && detailFields.length > 0 && (
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2.5 text-xs">
          {detailFields.map((d) => (
            <div key={d.label} className="space-y-0.5">
              <dt className="text-[11px] font-black uppercase tracking-wider text-neutral-600">
                {d.label}
              </dt>
              <dd className="font-bold text-black">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
};
interface DrillDownSummary {
  publicUrl?: string;
  campuses: CampusName[];
  departments: string[];
  evaluationsCount: number;
  hasConsistentLevels?: boolean;
  averageDidatica: number | null;
  recommendationRate: number;
  recommendYesCount: number;
  recommendDependeCount: number;
  recommendNoCount: number;
  evaluations: ProfessorEvaluation[];
}

/**
 * Drill-down compartilhado por professor e matéria: resumo + lista paginada
 * de relatos. Assume relatos ordenados do mais recente (garantido pelo use-case).
 */
const EvaluationDrillDown: React.FC<{
  icon: LucideIcon;
  title: string;
  relatedLabel: string;
  relatedItems: string[];
  summary: DrillDownSummary;
  onBack: () => void;
}> = ({
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
    safePage * PAGE_SIZE
  );

  const avgDisplay =
    summary.averageDidatica !== null
      ? summary.averageDidatica.toLocaleString('pt-BR', {
          maximumFractionDigits: 1,
        })
      : 'N/A';

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
      <Card className="bg-white rounded-lg p-6 shadow-neo space-y-4">
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
              {normalizeDepartmentName(dept)}
            </Badge>
          ))}
          {hasConsensusSeal(summary) && (
            <ConsensusSeal count={summary.evaluationsCount} />
          )}
          {summary.publicUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openExternalUrl(summary.publicUrl!)}
              className="h-6 px-2.5 text-[11px]"
            >
              <span>Página SIGAA</span>
              <ExternalLink className="w-3 h-3 stroke-[2.5]" />
            </Button>
          )}
        </div>

        {/* Indicadores centralizados: faixa única, colunas com divisores */}
        <div className="grid grid-cols-3 divide-x-2 divide-black/10">
          <div className="px-2 text-center">
            <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Didática Média
            </span>
            <span className="flex items-center justify-center gap-1 text-2xl font-black text-black">
              <Star className="w-4 h-4 stroke-[2.5] fill-current shrink-0" />
              {avgDisplay}
              {summary.averageDidatica !== null && (
                <span className="text-sm font-bold text-neutral-600">/10</span>
              )}
            </span>
            <span className="block text-[10px] font-bold text-neutral-600">
              em todas as matérias
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
            <span className="block text-[10px] font-bold text-neutral-600">
              em todas as matérias
            </span>
          </div>

          <div className="px-2 text-center">
            <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Relatos
            </span>
            <span className="flex items-center justify-center text-2xl font-black text-black">
              {summary.evaluationsCount}
            </span>
            <span className="block text-[10px] font-bold text-neutral-600">
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
                className="text-xs font-bold bg-neutral-100 px-2.5 py-1 border-2 border-black rounded-lg"
              >
                {item}
              </span>
            ))}
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
            {summary.recommendNoCount === 1 ? 'não recomenda' : 'não recomendam'}
          </span>
        </div>
      </Card>

      {/* Lista de Relatos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-neutral-600 px-1">
          <span>
            Avaliações registradas ({reviews.length}{' '}
            {reviews.length === 1 ? 'relato' : 'relatos'})
          </span>
          <span>Ordenado das mais recentes</span>
        </div>

        {pageItems.map((ev) => (
          <ReviewCard key={ev.id} evaluation={ev} detailed />
        ))}

        <Pagination
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
        />
      </div>
    </PageContainer>
  );
};

/** Card compacto de professor dentro do drill-down de matéria. */
const MateriaProfessorCard: React.FC<{
  prof: ProfessorSummary;
  onOpen: (prof: ProfessorSummary) => void;
}> = ({ prof, onOpen }) => {
  const avgStr =
    prof.averageDidatica !== null
      ? prof.averageDidatica.toLocaleString('pt-BR', {
          maximumFractionDigits: 1,
        })
      : 'N/A';

  return (
    <Card
      onClick={() => onOpen(prof)}
      role="button"
      tabIndex={0}
      aria-label={`Ver ${prof.evaluationsCount} relatos de ${prof.professorName}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(prof);
        }
      }}
      className="cursor-pointer bg-white rounded-lg p-4 shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out flex items-center justify-between gap-3 group"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {hasConsensusSeal(prof) && (
            <ConsensusSeal count={prof.evaluationsCount} />
          )}
        </div>
        <h3 className="text-sm md:text-base font-black text-black leading-snug truncate group-hover:text-neo-blue transition-colors">
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
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border-2 text-xs font-black shrink-0 ${getDidaticaBadgeStyle(
          prof.averageDidatica
        )}`}
      >
        <Star className="w-3.5 h-3.5 stroke-[2.5] fill-current shrink-0" />
        {avgStr}
      </span>
    </Card>
  );
};

/**
 * Drill-down de matéria: card-resumo com médias ENTRE professores (há poucos
 * relatos por matéria — professor é o agregado confiável) e a grade de cards
 * de professores, que abrem os relatos de cada um.
 */
const DisciplineDrillDown: React.FC<{
  summary: DisciplineSummary;
  professorSummaries: ProfessorSummary[];
  onBack: () => void;
  onOpenProfessor: (prof: ProfessorSummary) => void;
}> = ({ summary, professorSummaries, onBack, onOpenProfessor }) => {
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
        icon={BookOpen}
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

      {/* Resumo da matéria */}
      <Card className="bg-white rounded-lg p-6 shadow-neo space-y-4">
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
              {normalizeDepartmentName(dept)}
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
              <Star className="w-4 h-4 stroke-[2.5] fill-current shrink-0" />
              {mediaStr}
              {mediaDidatica !== null && (
                <span className="text-sm font-bold text-neutral-600">/10</span>
              )}
            </span>
            <span className="block text-[10px] font-bold text-neutral-600">
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
            <span className="block text-[10px] font-bold text-neutral-600">
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
            <span className="block text-[10px] font-bold text-neutral-600">
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
            {summary.recommendNoCount === 1 ? 'não recomenda' : 'não recomendam'}
          </span>
        </div>
      </Card>

      {/* Professores da matéria */}
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-wider text-neutral-600 px-1">
          Professores desta matéria ({professorSummaries.length})
        </p>
        {professorSummaries.length === 0 ? (
          <p className="text-xs font-bold text-neutral-600 px-1">
            Não foi possível relacionar professores a esta matéria.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {professorSummaries.map((prof) => (
              <MateriaProfessorCard
                key={prof.professorKey}
                prof={prof}
                onOpen={onOpenProfessor}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export const ProfessorEvaluationsScreen: React.FC = () => {
  const {
    summaries,
    disciplineSummaries,
    isLoading,
    hasLoadedOnce,
    searchQuery,
    setSearchQuery,
    selectedCampus,
    setSelectedCampus,
    selectedDifficulty,
    setSelectedDifficulty,
    sortBy,
    setSortBy,
    error,
    retry,
  } = useProfessorEvaluations();
  const { useCases, repos } = useContainer();

  const [filterByCourse, setFilterByCourse] = useState(true);
  const [hasCourseProfile, setHasCourseProfile] = useState(false);
  const [courseCodes, setCourseCodes] = useState<Set<string>>(new Set());

  const loadCourseScope = useCallback(async () => {
    try {
      const profile = await useCases.manageAcademicProfile.getProfile();
      if (!profile) {
        setHasCourseProfile(false);
        setCourseCodes(new Set());
        return;
      }
      setHasCourseProfile(true);

      const courseId = await resolveCourseIdForProfile(
        profile,
        repos.gradeRepo
      );
      if (!courseId) {
        setCourseCodes(new Set());
        return;
      }
      const curricula =
        await useCases.manageAcademicProfile.getCurriculaForCourse(courseId);
      if (!curricula.length) {
        setCourseCodes(new Set());
        return;
      }

      // Matriz atual do usuário + a mais recente do curso.
      const sorted = [...curricula].sort((a, b) =>
        (b.createdYear ?? '').localeCompare(a.createdYear ?? '')
      );
      const picked = new Map<string, CurriculumStructure>();
      const userCurriculum = curricula.find(
        (c) =>
          c.code === profile.curriculumCode || c.id === profile.curriculumId
      );
      if (userCurriculum) picked.set(userCurriculum.id, userCurriculum);
      if (sorted[0]) picked.set(sorted[0].id, sorted[0]);
      if (picked.size === 0) {
        for (const c of curricula) picked.set(c.id, c);
      }

      const codes = new Set<string>();
      for (const c of picked.values()) {
        for (const d of [
          ...c.mandatoryDisciplines,
          ...c.electiveDisciplines,
          ...c.complementaryDisciplines,
        ]) {
          if (d.code) codes.add(d.code.toUpperCase());
        }
      }
      // Matérias adicionadas pelo usuário no Gerenciar currículo.
      const custom = profile.customCurriculum;
      if (custom) {
        for (const d of [
          ...custom.mandatoryDisciplines,
          ...custom.electiveDisciplines,
          ...custom.complementaryDisciplines,
        ]) {
          if (d.code) codes.add(d.code.toUpperCase());
        }
      }
      setCourseCodes(codes);
    } catch (e) {
      console.warn(
        '[Avaliações] Não foi possível carregar as matrizes do curso:',
        e
      );
    }
  }, [useCases, repos]);

  useEffect(() => {
    void loadCourseScope();
    // Reexecuta quando uma sincronização termina: o perfil pode ter acabado
    // de ser criado (primeiro login) ou mudado de curso.
    const unsubscribe = subscribeToSyncComplete(() => {
      void loadCourseScope();
    });
    return unsubscribe;
  }, [loadCourseScope]);

  const [viewMode, setViewMode] = useState<EvaluationViewMode>(
    cachedEvaluationViewMode
  );
  const [selectedProfessor, setSelectedProfessor] =
    useState<ProfessorSummary | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] =
    useState<DisciplineSummary | null>(null);

  // Professores da matéria em drill-down, com o histórico completo de cada
  // um (as notas do card agregam todas as matérias do docente).
  const materiaProfessors = useMemo(() => {
    if (!selectedDiscipline) return [] as ProfessorSummary[];
    const byKey = new Map<string, ProfessorSummary>();
    for (const s of summaries) byKey.set(s.professorKey, s);
    const seen = new Map<string, ProfessorSummary>();
    for (const ev of selectedDiscipline.evaluations) {
      const key = normalizeText(ev.professor)
        .replace(/^PROF(?:ESSOR|ESSORA)?\.?\s+/i, '')
        .trim();
      if (key && !seen.has(key)) {
        const prof = byKey.get(key);
        if (prof) seen.set(key, prof);
      }
    }
    return [...seen.values()].sort(
      (a, b) =>
        b.recommendationRate - a.recommendationRate ||
        b.evaluationsCount - a.evaluationsCount
    );
  }, [selectedDiscipline, summaries]);

  const switchViewMode = (mode: EvaluationViewMode) => {
    cachedEvaluationViewMode = mode;
    setViewMode(mode);
  };

  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCampus, selectedDifficulty, sortBy, viewMode]);

  if (isLoading && !hasLoadedOnce) {
    return (
      <PageContainer>
        <PageHeader icon={Star} title="Avaliação de Professores" />
        <div role="status" aria-busy="true">
          <span className="sr-only">
            Carregando avaliações de professores...
          </span>
          <Card className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </Card>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 space-y-4">
              <div className="flex justify-between">
                <div className="space-y-2 w-2/3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-6 w-3/4" />
                </div>
                <Skeleton className="h-12 w-20" />
              </div>
              <Skeleton className="h-20 w-full" />
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  // Estado de erro na primeira carga: nunca vender falha como "filtros sem resultado"
  if (error && !hasLoadedOnce) {
    return (
      <PageContainer>
        <PageHeader icon={Star} title="Avaliação de Professores" />
        <EmptyState
          icon={CloudOff}
          iconClassName="bg-pastel-red text-ink-error"
          title="Não conseguimos carregar os relatos"
          description="Ocorreu um problema ao buscar as avaliações da comunidade. Verifique sua conexão e tente de novo."
          action={
            <Button type="button" variant="primary" size="sm" onClick={retry}>
              <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
              Tentar novamente
            </Button>
          }
        />
      </PageContainer>
    );
  }

  // Drill-down: Visualizando todas as avaliações de um professor específico
  if (selectedProfessor) {
    return (
      <EvaluationDrillDown
        icon={GraduationCap}
        title={selectedProfessor.professorName}
        relatedLabel="Disciplinas Avaliadas"
        relatedItems={selectedProfessor.disciplines}
        summary={selectedProfessor}
        onBack={() => setSelectedProfessor(null)}
      />
    );
  }

  // Drill-down: matéria como hub de professores — cada card abre o histórico
  // completo (relatos) do docente.
  if (selectedDiscipline) {
    return (
      <DisciplineDrillDown
        summary={selectedDiscipline}
        professorSummaries={materiaProfessors}
        onBack={() => setSelectedDiscipline(null)}
        onOpenProfessor={(prof) => {
          setSelectedDiscipline(null);
          setSelectedProfessor(prof);
        }}
      />
    );
  }
  const disciplineCodeOf = (name: string): string | null =>
    name.match(/[A-Z]{3}\d{4}/)?.[0]?.toUpperCase() ?? null;

  const courseFilterActive =
    filterByCourse && hasCourseProfile && courseCodes.size > 0;

  const visibleSummaries = courseFilterActive
    ? summaries.filter((s) =>
        s.disciplines.some((d) => {
          const code = disciplineCodeOf(d);
          return code ? courseCodes.has(code) : false;
        })
      )
    : summaries;

  const visibleDisciplines = courseFilterActive
    ? disciplineSummaries.filter((s) => {
        if (
          s.disciplineCode &&
          courseCodes.has(s.disciplineCode.toUpperCase())
        ) {
          return true;
        }
        const code = disciplineCodeOf(s.disciplineName);
        return code ? courseCodes.has(code) : false;
      })
    : disciplineSummaries;

  const totalListCount =
    viewMode === 'professors'
      ? visibleSummaries.length
      : visibleDisciplines.length;
  const pageCount = Math.max(1, Math.ceil(totalListCount / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageSummaries = visibleSummaries.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );
  const pageDisciplines = visibleDisciplines.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  return (
    <PageContainer>
      <PageHeader icon={Star} title="Avaliação de Professores" />

      {/* Barra de Busca e Filtros */}
      <div className="bg-white border-2 border-black rounded-lg p-4 shadow-neo space-y-4">
        {/* Linha 1: Campo de Busca + Segmented Control (Relatos | Professores | Matérias) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 stroke-[2.5]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por professor, disciplina (ex: CIC0004, Cálculo), departamento ou feedback..."
              aria-label="Buscar avaliações de professores"
              className="w-full bg-white pl-10 pr-9 py-2.5 text-sm font-medium text-black border-2 border-black rounded-xl focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[transform,box-shadow,background-color,border-color] placeholder:text-neutral-400 shadow-none"
            />
            {searchQuery.trim() !== '' && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Limpar busca"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-xs p-0.5 text-neutral-500 hover:text-black hover:bg-neutral-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  }
                />
                <TooltipContent>Limpar busca</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Segmented Control (Professores | Matérias) */}
          <div
            role="group"
            aria-label="Modo de visualização das avaliações"
            className="relative grid grid-cols-2 gap-0.5 p-0.5 bg-white border-2 border-black rounded-xl shrink-0 self-end sm:self-auto"
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-3px)] rounded-lg bg-neo-blue transition-transform duration-150 ease-out ${
                viewMode === 'disciplines'
                  ? 'translate-x-[calc(100%+2px)]'
                  : 'translate-x-0'
              }`}
            />
            <button
              type="button"
              onClick={() => switchViewMode('professors')}
              aria-pressed={viewMode === 'professors'}
              className={`relative cursor-pointer flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-black transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 ${
                viewMode === 'professors'
                  ? 'text-white'
                  : 'text-black hover:bg-neutral-100'
              }`}
            >
              <Users className="w-3.5 h-3.5 stroke-[2.5]" />
              Professores
            </button>
            <button
              type="button"
              onClick={() => switchViewMode('disciplines')}
              aria-pressed={viewMode === 'disciplines'}
              className={`relative cursor-pointer flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-black transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 ${
                viewMode === 'disciplines'
                  ? 'text-white'
                  : 'text-black hover:bg-neutral-100'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 stroke-[2.5]" />
              Matérias
            </button>
          </div>
        </div>

        {/* Linha 2: Filtros em linha, labels inline */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-600">
              Campus:
            </span>
            <div className="w-36">
              <Select
                items={campusFilterItems}
                value={selectedCampus}
                onValueChange={(val) =>
                  setSelectedCampus((val as CampusName | 'all') ?? 'all')
                }
              >
                <SelectTrigger aria-label="Filtrar por campus">
                  <SelectValue placeholder="Todos os campi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os campi</SelectItem>
                  <SelectItem value="Darcy Ribeiro">Darcy Ribeiro</SelectItem>
                  <SelectItem value="Ceilândia">Ceilândia</SelectItem>
                  <SelectItem value="Gama">Gama</SelectItem>
                  <SelectItem value="Planaltina">Planaltina</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-600">
              Dificuldade:
            </span>
            <div className="w-44">
              <Select
                items={difficultyFilterItems}
                value={selectedDifficulty}
                onValueChange={(val) =>
                  setSelectedDifficulty((val as DifficultyLevel | 'all') ?? 'all')
                }
              >
                <SelectTrigger aria-label="Filtrar por dificuldade">
                  <SelectValue placeholder="Todas as dificuldades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as dificuldades</SelectItem>
                  <SelectItem value="muito_facil">Muito fácil</SelectItem>
                  <SelectItem value="facil">Fácil</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="dificil">Difícil</SelectItem>
                  <SelectItem value="muito_dificil">Muito difícil</SelectItem>
                  <SelectItem value="nivel_god">Nível God</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-600">
              Ordenar por:
            </span>
            <div className="w-48">
              <Select
                items={sortItems}
                value={sortBy}
                onValueChange={(val) =>
                  setSortBy((val as ProfessorEvaluationSortBy) ?? 'recommendation_desc')
                }
              >
                <SelectTrigger aria-label="Ordenar avaliações">
                  <SelectValue placeholder="Mais recentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recommendation_desc">
                    Mais recomendados
                  </SelectItem>
                  <SelectItem value="rating_desc">Maior didática (10 → 0)</SelectItem>
                  <SelectItem value="rating_asc">Menor didática (0 → 10)</SelectItem>
                  <SelectItem value="reviews_desc">Mais avaliados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasCourseProfile && (
            <div className="inline-flex items-center gap-2 ml-auto">
              <span className="text-xs font-bold text-neutral-600">
                Filtrar pelo meu curso:
              </span>
              <Switch
                checked={filterByCourse}
                onCheckedChange={(checked) => setFilterByCourse(checked === true)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Aviso permanente: origem e responsabilidade do conteúdo */}
      <Alert
        variant="yellow"
        title="Sobre as avaliações"
        description="Relatos de uma base colaborativa pública, mantida por estudantes e sem moderação prévia. As opiniões refletem o ponto de vista individual de seus autores — podem conter imprecisões, conteúdos desatualizados ou ofensivos — e a plataforma não se responsabiliza pelas manifestações, eventuais ofensas ou desinformações veiculadas. Use as avaliações como apoio à sua tomada de decisão, e não como verdade absoluta."
        className="p-3 shadow-neo-xs"
        aside={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openExternalUrl(PROFESSOR_EVALUATIONS_SHEET_URL)}
            title="Abrir planilha colaborativa no Google Sheets"
          >
            <span>Ver Planilha</span>
            <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
          </Button>
        }
      />

      {/* Conteúdo Principal */}
      {totalListCount === 0 ? (
        <EmptyState
          icon={Star}
          iconClassName="bg-canvas text-neo-blue"
          title="Nenhuma avaliação encontrada"
          description="Não encontramos relatos para os filtros selecionados. Tente buscar por outro termo ou limpe os filtros."
        />
      ) : viewMode === 'professors' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-600 px-1">
            <span>
              Professores Avaliados ({visibleSummaries.length}{' '}
              {summaries.length === 1 ? 'docente' : 'docentes'})
            </span>
            <span>Selecione um card para ler os relatos completos</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageSummaries.map((prof) => {
              const avgStr =
                prof.averageDidatica !== null
                  ? prof.averageDidatica.toLocaleString('pt-BR', {
                      maximumFractionDigits: 1,
                    })
                  : 'N/A';

              return (
                <Card
                  key={prof.professorKey}
                  onClick={() => setSelectedProfessor(prof)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver ${prof.evaluationsCount} avaliações de ${prof.professorName}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedProfessor(prof);
                    }
                  }}
                  className="cursor-pointer bg-white rounded-lg p-6 shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {prof.campuses.map((c) => (
                          <Badge key={c} variant="outline" size="sm">
                            {c}
                          </Badge>
                        ))}
                        {hasConsensusSeal(prof) && (
                          <ConsensusSeal count={prof.evaluationsCount} />
                        )}
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border-2 text-xs font-black shrink-0 ${getDidaticaBadgeStyle(
                          prof.averageDidatica
                        )}`}
                      >
                        <Star className="w-3.5 h-3.5 stroke-[2.5] fill-current shrink-0" />
                        {avgStr}
                      </span>
                    </div>

                    <h3 className="text-base md:text-lg font-black text-black leading-snug mb-2 group-hover:text-neo-blue transition-colors">
                      {prof.professorName}
                    </h3>

                    <div className="space-y-1.5 text-xs font-medium text-neutral-700">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5] shrink-0" />
                        <span className="truncate">
                          {prof.disciplines.slice(0, 2).join(', ')}
                          {prof.disciplines.length > 2
                            ? ` (+${prof.disciplines.length - 2})`
                            : ''}
                        </span>
                      </div>

                      {prof.departments.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5] shrink-0" />
                          <span className="truncate">
                            {prof.departments.slice(0, 2).join(' • ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-4 border-t-2 border-black/10 mt-4 text-xs font-bold">
                    <span className="inline-flex items-center gap-1.5 text-neutral-700">
                      <ThumbsUp className="w-3.5 h-3.5 stroke-[2.5] text-ink-success" />
                      {prof.recommendationRate}% recomendam
                      <span className="text-neutral-500">·</span>
                      {prof.evaluationsCount}{' '}
                      {prof.evaluationsCount === 1 ? 'relato' : 'relatos'}
                    </span>
                    <span className="text-neutral-800 text-[11px] underline decoration-2 group-hover:text-neo-blue font-extrabold">
                      Ver relatos →
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination
            page={safePage}
            pageCount={pageCount}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-600 px-1">
            <span>
              Matérias Avaliadas ({visibleDisciplines.length}{' '}
              {disciplineSummaries.length === 1 ? 'matéria' : 'matérias'})
            </span>
            <span>Selecione um card para ler os relatos completos</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageDisciplines.map((disc) => {
              const avgStr =
                disc.averageDidatica !== null
                  ? disc.averageDidatica.toLocaleString('pt-BR', {
                      maximumFractionDigits: 1,
                    })
                  : 'N/A';

              return (
                <Card
                  key={disc.disciplineKey}
                  onClick={() => setSelectedDiscipline(disc)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver ${disc.evaluationsCount} avaliações de ${disc.disciplineName}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDiscipline(disc);
                    }
                  }}
                  className="cursor-pointer bg-white rounded-lg p-6 shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {disc.campuses.map((c) => (
                          <Badge key={c} variant="outline" size="sm">
                            {c}
                          </Badge>
                        ))}
                        {hasConsensusSeal(disc) && (
                          <ConsensusSeal count={disc.evaluationsCount} />
                        )}
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border-2 text-xs font-black shrink-0 ${getDidaticaBadgeStyle(
                          disc.averageDidatica
                        )}`}
                      >
                        <Star className="w-3.5 h-3.5 stroke-[2.5] fill-current shrink-0" />
                        {avgStr}
                      </span>
                    </div>

                    <h3 className="text-sm md:text-base font-black text-black leading-snug mb-2 group-hover:text-neo-blue transition-colors">
                      {disc.disciplineName}
                    </h3>

                    <div className="space-y-1.5 text-xs font-medium text-neutral-700">
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5] shrink-0" />
                        <span className="truncate">
                          {disc.professors.slice(0, 2).join(', ')}
                          {disc.professors.length > 2
                            ? ` (+${disc.professors.length - 2})`
                            : ''}
                        </span>
                      </div>

                      {disc.departments.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-neutral-500 stroke-[2.5] shrink-0" />
                          <span className="truncate">
                            {disc.departments.slice(0, 2).join(' • ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-4 border-t-2 border-black/10 mt-4 text-xs font-bold">
                    <span className="inline-flex items-center gap-1.5 text-neutral-700">
                      <ThumbsUp className="w-3.5 h-3.5 stroke-[2.5] text-ink-success" />
                      {disc.recommendationRate}% recomendam
                      <span className="text-neutral-500">·</span>
                      {disc.evaluationsCount}{' '}
                      {disc.evaluationsCount === 1 ? 'relato' : 'relatos'}
                    </span>
                    <span className="text-neutral-800 text-[11px] underline decoration-2 group-hover:text-neo-blue font-extrabold">
                      Ver relatos →
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination
            page={safePage}
            pageCount={pageCount}
            onPageChange={setPage}
          />
        </div>
      )}
    </PageContainer>
  );
};
