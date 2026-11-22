import React from 'react';
import { Card, PageContainer, Skeleton } from '@/components/ui';
import { FeedListSkeleton } from '@/components/feed/FeedListSkeleton';

// Larguras determinísticas por item de nav — lista viva, não fileira de blocos iguais
const NAV_LABEL_WIDTHS = ['w-12', 'w-24', 'w-24', 'w-24', 'w-28', 'w-20', 'w-28'] as const;
const MOBILE_TAB_COUNT = 5;

/**
 * Shell de arranque sem tinta: espelha a geometria exata do app principal
 * no desktop (Sidebar w-64 + PageContainer com título, toolbar do feed e lista)
 * e no mobile (PageHeader com marca fixa, barra de busca + filtro, lista e tapbar inferior)
 * para a troca skeleton → app acontecer sem salto de layout. Logo e texto
 * "Saruê UnB" ficam fixos como âncora de identidade durante o carregamento;
 * blocos de skeleton nunca levam borda nem sombra — A Regra do Bloco Sem Borda.
 */
export const AppBootSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" className="h-full">
    <span className="sr-only">Carregando o Saruê...</span>
    <div
      aria-hidden="true"
      className="flex h-full bg-canvas bg-grid overflow-hidden"
    >
      {/* Desktop — Sidebar preview: cromo real, marca fixa e navegação sem tinta */}
      <aside className="hidden md:flex h-full w-64 shrink-0 bg-paper border-r-2 border-ink flex-col select-none overflow-x-hidden">
        <div className="min-h-0 flex-1 flex flex-col">
          {/* Header com logo-bloco e wordmark fixos */}
          <div className="shrink-0 p-4 border-b-2 border-ink flex items-center min-h-[69px]">
            <div className="w-[42px] h-[42px] shrink-0 border-2 border-ink rounded-xl overflow-hidden shadow-[2px_2px_0px_0px_var(--neo-shadow)] bg-paper flex items-center justify-center">
              <img
                src="/sarue-logo.png"
                alt=""
                className="w-full h-full object-cover select-none pointer-events-none"
              />
            </div>
            <span className="ml-3 font-extrabold text-base tracking-tight whitespace-nowrap text-black">
              Saruê <span className="text-unb-blue">UnB</span>
            </span>
          </div>

          {/* Navegação: 7 linhas com as divisórias reais da sidebar */}
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

      {/* Conteúdo central: espelha AppShell (<main>) + DashboardScreen (<PageContainer>) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-y-auto px-2.5 pt-3 pb-6 md:px-4 md:py-8">
          <PageContainer>
            {/* Mobile — Header com logo e texto Saruê UnB fixos + slot do botão de ações */}
            <div className="flex md:hidden items-center justify-between gap-2 min-h-10">
              <div className="inline-flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 border-2 border-ink rounded-xl overflow-hidden shadow-neo-sm flex items-center justify-center bg-paper shrink-0">
                  <img
                    src="/sarue-logo.png"
                    alt=""
                    className="w-full h-full object-cover select-none pointer-events-none"
                  />
                </div>
                <span className="font-extrabold text-base tracking-tight whitespace-nowrap text-black">
                  Saruê <span className="text-unb-blue">UnB</span>
                </span>
              </div>
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            </div>

            {/* Desktop — Título da página ("Início") */}
            <Skeleton className="hidden md:block h-7 w-40" />

            {/* Mobile — Toolbar compacta em 1 linha (busca + botão de filtros) */}
            <div className="flex md:hidden items-center gap-2">
              <Skeleton className="h-10 flex-1 min-w-0 rounded-xl" />
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            </div>

            {/* Desktop — Toolbar do Feed: card real (adesivo), controles sem tinta */}
            <div className="hidden md:block bg-paper border-2 border-ink rounded-lg shadow-(--neo-card-shadow)">
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

            {/* Feed: Card real (shadow-neo-sm no mobile, neo no desktop) + skeleton das linhas */}
            <Card className="p-0 overflow-hidden">
              <FeedListSkeleton />
            </Card>
          </PageContainer>
        </main>
      </div>

      {/* Mobile — Bottom Tab Bar preview: cromo real com 5 destinos sem tinta */}
      <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden w-full bg-paper border-t-2 border-ink px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] select-none">
        <div className="w-full grid grid-cols-5 gap-1">
          {Array.from({ length: MOBILE_TAB_COUNT }).map((_, index) => (
            <div
              key={index}
              className="flex items-center justify-center min-h-[48px] py-2 px-1 rounded-xl"
            >
              <Skeleton className="w-6 h-6 rounded-md" />
            </div>
          ))}
        </div>
      </nav>
    </div>
  </div>
);
