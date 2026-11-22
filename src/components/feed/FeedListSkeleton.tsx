import React from 'react';
import { Skeleton } from '@/components/ui';

export interface FeedListSkeletonProps {
  rows?: number;
}

// Larguras determinísticas por linha — lista viva, não fileira de blocos iguais
const ROW_PATTERN = [
  { title: 'w-2/5', meta: 'w-24', hasDue: true },
  { title: 'w-1/3', meta: 'w-32', hasDue: false },
  { title: 'w-1/2', meta: 'w-20', hasDue: true },
  { title: 'w-1/4', meta: 'w-28', hasDue: true },
  { title: 'w-2/5', meta: 'w-24', hasDue: false },
  { title: 'w-1/3', meta: 'w-20', hasDue: true },
  { title: 'w-1/2', meta: 'w-32', hasDue: true },
  { title: 'w-1/4', meta: 'w-24', hasDue: true },
] as const;

/**
 * Placeholder do FeedList: espelha a geometria exata das linhas reais
 * (ícone à esquerda, duas alturas, meta em pills, prazo à direita em sm+)
 * para a troca skeleton → conteúdo acontecer sem salto de layout.
 */
export const FeedListSkeleton: React.FC<FeedListSkeletonProps> = ({ rows = 8 }) => {
  return (
    <ul role="list" className="divide-y-2 divide-black/10">
      {ROW_PATTERN.slice(0, rows).map((row, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-4 md:px-5">
          {/* Ícone do tipo */}
          <Skeleton className="h-4 w-4 shrink-0" />

          {/* Título + meta */}
          <div className="min-w-0 flex-1">
            <Skeleton className={`h-3 ${row.title}`} />
            <div className="mt-2 flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2">
              <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
              <Skeleton className={`h-6 shrink-0 rounded-full ${row.meta}`} />
              <Skeleton className="h-2 w-32 rounded-full" />
            </div>
          </div>

          {/* Prazo, alinhado à direita (some em telas estreitas, como na lista real) */}
          {row.hasDue ? (
            <div className="hidden shrink-0 sm:flex">
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
};
