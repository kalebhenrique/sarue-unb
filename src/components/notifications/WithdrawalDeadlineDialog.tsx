import React, { useState, useEffect } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
} from '@/components/ui';
import type { AcademicCalendar } from '@/core';

export interface WithdrawalDeadlineDialogProps {
  calendar: AcademicCalendar | null;
}

interface DeadlineAlertItem {
  type: 'parcial' | 'geral';
  title: string;
  deadlineRaw: string;
  daysLeft: number;
  storageKey: string;
}

export const WithdrawalDeadlineDialog: React.FC<WithdrawalDeadlineDialogProps> = ({
  calendar,
}) => {
  const [open, setOpen] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<DeadlineAlertItem[]>([]);

  useEffect(() => {
    if (!calendar) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sem = calendar.semester;
    const candidates: DeadlineAlertItem[] = [];

    // 1. Trancamento Parcial
    if (calendar.periodoTrancamentoParcial?.limite) {
      const [y, m, d] = calendar.periodoTrancamentoParcial.limite.split('-').map(Number);
      const limiteDate = new Date(y, m - 1, d);
      const days = Math.round((limiteDate.getTime() - today.getTime()) / 86_400_000);
      const storageKey = `sarue_withdrawal_dismissed_${sem}_parcial`;

      if (days >= 0 && days <= 7) {
        try {
          if (localStorage.getItem(storageKey) !== 'true') {
            candidates.push({
              type: 'parcial',
              title: 'Trancamento Parcial de Disciplinas',
              deadlineRaw: calendar.periodoTrancamentoParcial.raw || `Até ${d}/${m}/${y}`,
              daysLeft: days,
              storageKey,
            });
          }
        } catch {}
      }
    }

    // 2. Trancamento Geral / Total
    if (calendar.periodoTrancamentoGeral?.limite) {
      const [y, m, d] = calendar.periodoTrancamentoGeral.limite.split('-').map(Number);
      const limiteDate = new Date(y, m - 1, d);
      const days = Math.round((limiteDate.getTime() - today.getTime()) / 86_400_000);
      const storageKey = `sarue_withdrawal_dismissed_${sem}_geral`;

      if (days >= 0 && days <= 7) {
        try {
          if (localStorage.getItem(storageKey) !== 'true') {
            candidates.push({
              type: 'geral',
              title: 'Trancamento Geral (Total)',
              deadlineRaw: calendar.periodoTrancamentoGeral.raw || `Até ${d}/${m}/${y}`,
              daysLeft: days,
              storageKey,
            });
          }
        } catch {}
      }
    }

    if (candidates.length > 0) {
      setActiveAlerts(candidates);
      setOpen(true);
    }
  }, [calendar]);

  const handleDismiss = () => {
    // Marca todos os alertas ativos como dispensados
    for (const item of activeAlerts) {
      try {
        localStorage.setItem(item.storageKey, 'true');
      } catch {}
    }
    setOpen(false);
  };

  if (!open || activeAlerts.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={true} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-lg bg-neo-yellow border-2 border-ink flex items-center justify-center shadow-neo-sm">
              <CalendarClock className="w-5 h-5 stroke-[2.5] text-ink" />
            </div>
            <DialogTitle>Última Semana de Trancamento</DialogTitle>
          </div>
          <DialogDescription>
            Atenção aos prazos regimentais da Universidade de Brasília para o semestre {calendar?.semester}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {activeAlerts.map((item) => (
            <div
              key={item.type}
              className="bg-pastel-yellow border-2 border-ink rounded-lg p-3.5 shadow-neo-sm space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-tight text-black flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  {item.title}
                </span>
                <Badge variant={item.daysLeft <= 2 ? 'urgent' : 'yellow'} size="sm">
                  {item.daysLeft === 0
                    ? 'Último dia hoje!'
                    : item.daysLeft === 1
                    ? 'Resta 1 dia'
                    : `Restam ${item.daysLeft} dias`}
                </Badge>
              </div>
              <p className="text-xs font-bold text-neutral-800">
                Prazo limite oficial do SIGAA: <span className="font-extrabold text-black">{item.deadlineRaw}</span>.
              </p>
            </div>
          ))}

          <p className="text-[11px] font-semibold text-neutral-600 leading-relaxed">
            Após essa data, novas solicitações de trancamento não serão aceitas pelo sistema da UnB. Caso deseje trancar alguma disciplina ou o semestre, acesse o portal do SIGAA a tempo.
          </p>
        </div>

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleDismiss}
            className="w-full sm:w-auto sm:min-w-32"
          >
            <span>Okay</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
