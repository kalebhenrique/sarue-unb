import React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui";

const STATEMENT_ROW_WIDTHS = ["w-40", "w-48", "w-36", "w-44"] as const;

/**
 * Placeholder dos cartões e do extrato da Carteirinha Estudantil:
 * espelha a geometria exata da pilha de cartões (altura h-52) e do
 * extrato do RU para a troca skeleton → conteúdo acontecer sem salto
 * de layout. O cromo dos cards leva a borda preta; blocos de skeleton
 * nunca levam borda nem sombra — A Regra do Bloco Sem Borda.
 */
export const WalletSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" className="space-y-5">
    <span className="sr-only">Carregando carteirinha estudantil...</span>

    {/* Pilha de Cartões Horizontais */}
    <section
      aria-hidden="true"
      className="grid grid-cols-1 lg:grid-cols-2 gap-5"
    >
      {/* Cartão 1: Carteirinha Estudantil */}
      <div className="w-full bg-paper border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo overflow-hidden flex flex-col justify-between">
        <div className="px-4 py-2.5 border-b-2 border-ink flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="w-4 h-4 rounded-sm" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>

        <div className="h-52 p-4 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="min-w-0 flex-1 space-y-2.5">
              <div>
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="mt-1.5 h-4 w-3/4" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="mt-1.5 h-3.5 w-20" />
                </div>
                <div>
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="mt-1.5 h-3.5 w-24" />
                </div>
              </div>

              <div>
                <Skeleton className="h-2.5 w-28" />
                <Skeleton className="mt-1.5 h-3.5 w-4/5" />
              </div>
            </div>

            <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
          </div>

          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      </div>

      {/* Cartão 2: QR Code BCE */}
      <div className="w-full bg-paper border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo overflow-hidden flex flex-col justify-between">
        <div className="px-4 py-2.5 border-b-2 border-ink flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="w-4 h-4 rounded-sm" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>

        <div className="h-52 p-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="mt-1.5 h-4 w-4/5" />
            </div>

            <div>
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="mt-1.5 h-3.5 w-20" />
            </div>

            <div>
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="mt-1.5 h-3.5 w-3/4" />
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center gap-1.5">
            <Skeleton className="w-[112px] h-[112px] rounded-xl" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    </section>

    {/* Seção de Saldo e Extrato no RU */}
    <section
      aria-hidden="true"
      className="bg-paper border-2 border-ink rounded-2xl p-4 sm:p-5 shadow-neo-sm md:shadow-neo space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b-2 border-ink pb-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
          <div>
            <Skeleton className="h-4 w-52" />
            <Skeleton className="mt-1.5 h-3 w-36" />
          </div>
        </div>
        <Skeleton className="h-7 w-32 rounded-xl self-start sm:self-auto" />
      </div>

      <div className="divide-y-2 divide-black/10">
        {STATEMENT_ROW_WIDTHS.map((titleWidth, index) => (
          <div
            key={index}
            className="py-2 flex items-center justify-between gap-3"
          >
            <div className="min-w-0 space-y-1.5">
              <Skeleton className={`h-3.5 ${titleWidth}`} />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-3.5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  </div>
);

/**
 * Skeleton de página inteira para a tela da Carteirinha Estudantil (primeira carga e Suspense).
 */
export const WalletPageSkeleton: React.FC = () => (
  <div className="max-w-4xl mx-auto pb-4 md:pb-12 space-y-5">
    <PageHeader title="Carteirinha Estudantil" />
    <WalletSkeleton />
  </div>
);
