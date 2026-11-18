import React from "react";
import {
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  Loader2,
  BookOpen,
  GraduationCap,
  Globe,
  School,
  Clock,
  MessageSquare,
  Sheet,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import type {
  SyncStepId,
  SyncStepInfo,
  SyncStepStatus,
} from "../context/SyncContext";

interface SyncStatusTooltipProps {
  steps: Record<SyncStepId, SyncStepInfo>;
  isSyncing: boolean;
  lastSyncedAt: string | null;
}

const STEP_ICONS = {
  sigaa: School,
  aprender3: BookOpen,
  teams: MessageSquare,
  myCourse: GraduationCap,
  ghPages: Globe,
  planilha: Sheet,
};

function StatusIndicator({ status }: { status: SyncStepStatus }) {
  switch (status) {
    case "syncing":
      return (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-ink shrink-0" />
      );
    case "success":
      return <CheckCircle2 className="w-3.5 h-3.5 text-ink-success shrink-0" />;
    case "error":
      return <AlertCircle className="w-3.5 h-3.5 text-ink-error shrink-0" />;
    case "skipped":
      return <MinusCircle className="w-3.5 h-3.5 text-neutral-500 shrink-0" />;
    case "idle":
    default:
      return (
        <div className="w-2 h-2 rounded-full bg-neutral-300 ml-0.5 mr-1 shrink-0" />
      );
  }
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Nunca sincronizado";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "Nunca sincronizado";

    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "Nunca sincronizado";
  }
}

function getOrderedSteps(steps: Record<SyncStepId, SyncStepInfo>): SyncStepInfo[] {
  return [
    steps.sigaa,
    steps.aprender3,
    steps.teams,
    steps.myCourse,
    steps.ghPages,
    steps.planilha,
  ];
}

function getSummaryStatusLabel(step: SyncStepInfo): string {
  switch (step.status) {
    case "syncing":
      return "Sincronizando...";
    case "success":
      return "Atualizado";
    case "error":
      return "Falha";
    case "skipped":
      return "Não conectado";
    case "idle":
    default:
      return "Aguardando";
  }
}

export const SyncStatusTooltip: React.FC<SyncStatusTooltipProps> = ({
  steps,
  isSyncing: _isSyncing,
  lastSyncedAt,
}) => {
  const stepList = getOrderedSteps(steps);

  return (
    <div className="w-full p-3 space-y-3 bg-canvas text-black select-none">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between border-b-2 border-ink pb-2">
        <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider">
          <span>Status da Sincronização</span>
        </div>
      </div>

      {/* Lista das sincronizações */}
      <div className="space-y-2">
        {stepList.map((step) => {
          const Icon = STEP_ICONS[step.id];

          return (
            <div
              key={step.id}
              className="p-2 rounded-lg border border-ink/15 bg-canvas hover:bg-neutral-100 transition-colors flex items-start gap-2.5"
            >
              <div className="p-1 rounded bg-canvas border border-ink/15 shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-neutral-700" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-neutral-900 truncate">
                    {step.label}
                  </span>
                  <StatusIndicator status={step.status} />
                </div>

                <p
                  className={`text-[11px] leading-snug mt-0.5 line-clamp-2 ${
                    step.status === "error"
                      ? "text-ink-error font-semibold"
                      : step.status === "success"
                        ? "text-ink-success font-medium"
                        : step.status === "syncing"
                          ? "text-blue-ink font-semibold"
                          : "text-neutral-500"
                  }`}
                >
                  {step.message || step.sublabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé com timestamp */}
      <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-[11px] text-neutral-600 font-semibold">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-neutral-500" />
          <span>Última sincronização:</span>
        </span>
        <span className="text-neutral-700 font-bold">
          {formatRelativeTime(lastSyncedAt)}
        </span>
      </div>
    </div>
  );
};

export interface SyncStatusSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps?: Record<SyncStepId, SyncStepInfo>;
  isSyncing: boolean;
  lastSyncedAt: string | null;
}

/**
 * Dialog resumido dos status de sincronização, aberto ao tocar na barra de
 * carregamento dentro do menu mobile da tab bar.
 */
export const SyncStatusSummaryDialog: React.FC<SyncStatusSummaryDialogProps> = ({
  open,
  onOpenChange,
  steps,
  isSyncing,
  lastSyncedAt,
}) => {
  const stepList = steps ? getOrderedSteps(steps) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-5 gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw
              className={`w-4 h-4 stroke-[2.5] text-blue-ink shrink-0 ${
                isSyncing ? "animate-spin" : ""
              }`}
            />
            <span>Status da Sincronização</span>
          </DialogTitle>
          <DialogDescription>
            {isSyncing
              ? "Sincronização em andamento..."
              : `Última atualização: ${formatRelativeTime(lastSyncedAt)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-ink/10 rounded-xl border-2 border-ink bg-paper overflow-hidden">
          {stepList.map((step) => {
            const Icon = STEP_ICONS[step.id];
            const statusText = getSummaryStatusLabel(step);

            return (
              <div
                key={step.id}
                className="px-3 py-2.5 flex items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-neutral-700 shrink-0 stroke-[2.2]" />
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-black truncate">
                      {step.label}
                    </p>
                    {step.status === "error" && step.message ? (
                      <p className="text-[11px] font-semibold text-ink-error truncate">
                        {step.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[11px] font-bold ${
                      step.status === "error"
                        ? "text-ink-error"
                        : step.status === "success"
                          ? "text-ink-success"
                          : step.status === "syncing"
                            ? "text-blue-ink"
                            : "text-neutral-500"
                    }`}
                  >
                    {statusText}
                  </span>
                  <StatusIndicator status={step.status} />
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
