import React from 'react';
import type { FlowchartMetrics } from '@/core';
import { Award, BookOpen, Calculator, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';

export interface FlowchartStatsProps {
  metrics: FlowchartMetrics;
  onOpenIraCalculator?: () => void;
}

export const FlowchartStats: React.FC<FlowchartStatsProps> = ({ metrics, onOpenIraCalculator }) => {
  const rawPercentual = metrics.percentualIntegralizado ?? metrics.mandatoryProgressPercentage;
  const percentual = Number.isFinite(rawPercentual) ? Math.max(0, Math.min(100, rawPercentual)) : 0;
  const totalCurriculo = metrics.chTotalCurriculo ?? metrics.totalHours;
  const obrigatoriaTotal = metrics.chObrigatoriaTotal;
  const obrigatoriaPendente = metrics.chObrigatoriaPendente;
  const optativaPendente = metrics.chOptativaPendente;

  const chConcluidaObrigatoria =
    obrigatoriaTotal && obrigatoriaTotal > 0 && obrigatoriaPendente != null
      ? Math.max(0, obrigatoriaTotal - obrigatoriaPendente)
      : Math.max(0, metrics.completedHours);

  const chTotalObrigatoriaExibida =
    obrigatoriaTotal && obrigatoriaTotal > 0
      ? obrigatoriaTotal
      : (metrics.chObrigatoriaTotal && metrics.chObrigatoriaTotal > 0
          ? metrics.chObrigatoriaTotal
          : (metrics.totalHours > 0 ? metrics.totalHours : undefined));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-paper border-2 border-ink rounded-xl p-4 shadow-neo flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-wider text-neutral-600">
            {metrics.isSimulated ? "Integralização" : "Integralização SIGAA"}
          </span>
          <div className="w-8 h-8 rounded-lg bg-pastel-green border-2 border-ink flex items-center justify-center text-ink dark:bg-neo-green shadow-neo-xs">
            <Award className="w-4 h-4 stroke-[2.5]" />
          </div>
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-black text-black">
              {percentual.toFixed(1).replace('.0', '')}%
            </span>
            <span className="text-xs font-bold text-neutral-600">
              {metrics.isSimulated ? "projetado" : "integralizado"}
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Percentual de integralização do curso"
            aria-valuenow={Math.round(percentual)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="w-full h-3.5 bg-neutral-100 border-2 border-ink rounded-full overflow-hidden p-0.5 shadow-neo-xs"
          >
            <div
              className="h-full bg-neo-green border border-ink rounded-full transition-[width] duration-500"
              style={{ width: `${percentual}%` }}
            />
          </div>
        </div>

        <p className="text-[11px] font-bold text-neutral-600 mt-2">
          {metrics.completedMandatoryDisciplines} de {metrics.totalMandatoryDisciplines} obrigatórias feitas
        </p>
      </div>

      <div className="bg-paper border-2 border-ink rounded-xl p-4 shadow-neo flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-wider text-neutral-600">
            CH Obrigatória
          </span>
          <div className="w-8 h-8 rounded-lg bg-pastel-blue border-2 border-ink flex items-center justify-center text-blue-ink dark:bg-sticker-blue dark:text-ink shadow-neo-xs">
            <Clock className="w-4 h-4 stroke-[2.5]" />
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-3xl font-black text-black">
            {chConcluidaObrigatoria}h
          </span>
          {chTotalObrigatoriaExibida != null && (
            <span className="text-xs font-bold text-neutral-600">
              de {chTotalObrigatoriaExibida}h
            </span>
          )}
        </div>

        <p className="text-[11px] font-bold text-neutral-600 mt-2">
          Pendente: <span className="text-black font-extrabold">{obrigatoriaPendente != null ? `${obrigatoriaPendente}h` : `${metrics.remainingHours}h`}</span> obrigatórias
        </p>
      </div>

      <div className="bg-paper border-2 border-ink rounded-xl p-4 shadow-neo flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-wider text-neutral-600">
            CH Total do Curso
          </span>
          <div className="w-8 h-8 rounded-lg bg-pastel-yellow border-2 border-ink flex items-center justify-center text-ink dark:bg-neo-yellow shadow-neo-xs">
            <Sparkles className="w-4 h-4 stroke-[2.5]" />
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-3xl font-black text-black">
            {totalCurriculo}h
          </span>
          <span className="text-xs font-bold text-neutral-600">
            currículo
          </span>
        </div>

        <p className="text-[11px] font-bold text-neutral-600 mt-2">
          Optativas pendentes: <span className="text-black font-extrabold">{optativaPendente != null ? `${optativaPendente}h` : '---'}</span>
        </p>
      </div>

      <div className="bg-paper border-2 border-ink rounded-xl p-4 shadow-neo flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-wider text-neutral-600">
            Índices Acadêmicos
          </span>
          <div className="w-8 h-8 rounded-lg bg-pastel-purple border-2 border-ink flex items-center justify-center text-neo-purple dark:bg-neo-purple dark:text-ink shadow-neo-xs">
            <BookOpen className="w-4 h-4 stroke-[2.5]" />
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-1">
          {metrics.ira != null && (
            <div>
              <span className="text-2xl font-black text-black">
                {metrics.ira.toFixed(2)}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 ml-1">
                IRA
              </span>
            </div>
          )}
          {metrics.mp != null && (
            <div>
              <span className="text-2xl font-black text-black">
                {metrics.mp.toFixed(2)}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 ml-1">
                MP
              </span>
            </div>
          )}
        </div>

        <div className="mt-2">
          <Button variant="yellow" size="sm" onClick={onOpenIraCalculator}>
            <Calculator className="w-3.5 h-3.5 stroke-[2.5]" />
            Calculadora de IRA
          </Button>
        </div>
      </div>
    </div>
  );
};
