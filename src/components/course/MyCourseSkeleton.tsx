import React from 'react';
import { Skeleton } from '@/components/ui';

// Larguras determinísticas — página viva, não fileira de blocos iguais
const SEMESTERS = [
  { rows: 5, codes: ['w-16', 'w-20', 'w-14', 'w-20', 'w-16'] },
  { rows: 4, codes: ['w-20', 'w-14', 'w-16', 'w-20'] },
  { rows: 5, codes: ['w-14', 'w-16', 'w-20', 'w-14', 'w-16'] },
  { rows: 3, codes: ['w-16', 'w-20', 'w-14'] },
] as const;

const FILTER_PILLS = ['w-[74px]', 'w-20', 'w-24', 'w-[88px]'] as const;

/**
 * Placeholder da tela Meu Curso: espelha a geometria exata das seções reais
 * (banner, métricas, "Cursando agora", barra de controles e lista por semestre)
 * para a troca skeleton → conteúdo acontecer sem salto de layout (@DESIGN.md).
 */
export const MyCourseSkeleton: React.FC = () => {
  return (
    <>
      {/* Cabeçalho da Página */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>

      {/* Banner de Identificação do Discente */}
      <div className="bg-paper border-2 border-ink rounded-lg p-5 mb-6 shadow-neo-sm md:shadow-neo">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-5 w-28 rounded-md" />
        </div>
      </div>

      {/* Painel de Métricas e Integralização */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-paper border-2 border-ink rounded-xl p-4 shadow-neo-sm md:shadow-neo"
          >
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3.5 w-full rounded-full mb-2" />
            <Skeleton className="h-2 w-36" />
          </div>
        ))}
      </div>

      {/* Painel "Cursando agora" */}
      <div className="bg-pastel-blue border-2 border-ink rounded-lg p-4 mb-6 shadow-neo-sm md:shadow-neo">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-3.5 w-28" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Lista de disciplinas: card único com busca no cabeçalho e semestres internos */}
      <section className="bg-paper border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-4 border-b-2 border-ink">
          <Skeleton className="h-9 flex-1 lg:max-w-md rounded-lg" />
          <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
            {FILTER_PILLS.map((w, i) => (
              <Skeleton key={i} className={`h-7 ${w} rounded-lg`} />
            ))}
          </div>
        </div>
        {SEMESTERS.map((sem, si) => (
          <div key={si} className={si > 0 ? 'border-t-2 border-ink' : ''}>
            <div className="px-4 py-2.5 bg-paper">
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {sem.codes.slice(0, sem.rows).map((w, ri) => (
                <div key={ri} className="flex items-center gap-3">
                  <Skeleton className={`h-6 ${w} rounded-md shrink-0`} />
                  <Skeleton className={`h-3 flex-1 max-w-xs ${ri % 2 === 0 ? 'max-w-sm' : ''}`} />
                  <Skeleton className="h-6 w-6 rounded-md shrink-0 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
};
