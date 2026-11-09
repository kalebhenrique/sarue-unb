import React from 'react';
import { Card, Skeleton } from '@/components/ui';
import { FeedListSkeleton } from '@/components/feed/FeedListSkeleton';

// Larguras determinísticas por item de nav — lista viva, não fileira de blocos iguais
const NAV_LABEL_WIDTHS = ['w-12', 'w-24', 'w-24', 'w-24', 'w-28', 'w-20', 'w-28'] as const;

/**
 * Shell de arranque sem tinta: espelha a geometria exata do app principal
 * (Sidebar w-64 + conteúdo max-w-6xl com título, toolbar do feed e lista)
 * para a troca skeleton → app acontecer sem salto de layout. O cromo real
 * (bordas da sidebar, Cards) leva o risco preto; bloco de skeleton nunca
 * leva borda nem sombra — A Regra do Bloco Sem Borda.
 */
export const AppBootSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" className="h-full">
    <span className="sr-only">Carregando o Saruê...</span>
    <div
      aria-hidden="true"
      className="flex h-full bg-canvas bg-grid overflow-hidden"
    >
      {/* Sidebar preview: cromo real, conteúdo sem tinta */}
      <aside className="h-full w-64 shrink-0 bg-paper border-r-2 border-ink flex flex-col select-none overflow-x-hidden">
        <div className="min-h-0 flex-1 flex flex-col">
          {/* Header com o logo-bloco real (identidade âncora) e wordmark sem tinta */}
          <div className="shrink-0 p-4 border-b-2 border-ink flex items-center min-h-[69px]">
            <div className="w-[42px] h-[42px] shrink-0 border-2 border-ink rounded-xl overflow-hidden shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
              <img
                src="/sarue-logo.png"
                alt=""
                className="w-full h-full object-cover select-none pointer-events-none"
              />
            </div>
            <Skeleton className="ml-3 h-4 w-24" />
          </div>

          {/* Navegação: 7 linhas com as divisórias reais da sidebar (Calendário incluso) */}
          <nav className="border-b-2 border-ink">
            <ul className="flex flex-col">
              {NAV_LABEL_WIDTHS.map((labelWidth, index) => (
                <li
                  key={index}
                  className="border-b-2 border-ink last:border-b-0"
                >
                  <div className="py-3.5 px-4 flex items-center">
                    <div className="w-[42px] h-6 shrink-0 flex items-center justify-center">
                      <Skeleton className="w-5 h-5" />
                    </div>
                    <Skeleton className={`ml-3 h-3 ${labelWidth}`} />
                  </div>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Rodapé: pill de Sincronizar (sem borda: não é adesivo ainda), sino e última sync */}
        <div className="shrink-0 p-4 border-t-2 border-ink">
          <div className="h-10 flex items-center">
            <Skeleton className="h-10 w-[calc(100%-48px)] rounded-2xl" />
            <Skeleton className="h-10 w-10 ml-2 rounded-xl" />
          </div>
          <Skeleton className="mt-2 h-2 w-28 mx-auto" />
        </div>
      </aside>

      {/* Conteúdo central: composição de primeira carga da Home */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-y-auto px-2 py-6 md:px-4 md:py-8">
          <div className="w-full max-w-6xl mx-auto space-y-6 pb-12">
            {/* Título da página */}
            <Skeleton className="h-7 w-40" />

            {/* Toolbar do Feed: card real (adesivo), controles sem tinta */}
            <div className="bg-paper border-2 border-ink rounded-lg shadow-(--neo-card-shadow)">
              <div className="space-y-3 p-4">
                {/* Cavidade de busca */}
                <Skeleton className="h-11 w-full rounded-xl" />
                {/* Filtros rotulados (Plataformas / Categoria) */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-2.5 w-14" />
                    <Skeleton className="h-[34px] w-36 rounded-xl" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-[34px] w-32 rounded-xl" />
                  </div>
                </div>
              </div>
            </div>

            {/* Feed: Card real + skeleton que espelha as linhas do feed */}
            <Card className="p-0 overflow-hidden">
              <FeedListSkeleton />
            </Card>
          </div>
        </main>
      </div>
    </div>
  </div>
);
