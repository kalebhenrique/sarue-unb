import React, { useState } from 'react';
import { Card, Badge } from '@/components/ui';
import {
  BookOpen,
  Building2,
  MessageSquareQuote,
  ClipboardCheck,
  ChevronDown,
} from 'lucide-react';
import {
  normalizeDepartmentDisplay,
  normalizeText,
  type ProfessorEvaluation,
  type RecommendationType,
} from '@/core';

export function getRecommendationBadge(rec: RecommendationType): React.ReactNode {
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
  if (rec === 'nao') {
    return (
      <Badge variant="urgent" size="sm">
        Não recomenda
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      size="sm"
      title="O relato não respondeu se recomendaria"
    >
      Sem resposta
    </Badge>
  );
}

export interface ReviewCardProps {
  evaluation: ProfessorEvaluation;
  /** Drill-down habilita "Mais detalhes" com os campos de curiosidade pós-decisão. */
  detailed?: boolean;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({
  evaluation,
  detailed = false,
}) => {
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
    evaluation.didaticaScore !== null
      ? { label: 'Didática:', value: `${scoreDisplay}/10` }
      : null,
    evaluation.difficulty
      ? { label: 'Dificuldade:', value: evaluation.difficulty }
      : null,
    evaluation.workload
      ? { label: 'Carga:', value: evaluation.workload }
      : null,
    evaluation.material ? { label: '', value: evaluation.material } : null,
    evaluation.attendance ? { label: '', value: evaluation.attendance } : null,
  ].filter((p): p is { label: string; value: string } => p !== null);

  return (
    <Card className="bg-paper rounded-lg p-6 shadow-neo space-y-4">
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
                  <span>
                    {normalizeDepartmentDisplay(evaluation.department)}
                  </span>
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
      </div>

      {/* Feedback sincero em destaque */}
      {evaluation.feedback ? (
        <div className="bg-cream border-2 border-ink rounded-lg p-3.5 shadow-neo-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-neutral-600 mb-1">
            <MessageSquareQuote className="w-3.5 h-3.5 stroke-[2.5] text-blue-ink shrink-0" />
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
