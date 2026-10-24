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
} from "lucide-react";
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
        <Loader2 className="w-3.5 h-3.5 animate-spin text-neo-blue shrink-0" />
      );
    case "success":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
    case "error":
      return <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
    case "skipped":
      return <MinusCircle className="w-3.5 h-3.5 text-neutral-400 shrink-0" />;
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

export const SyncStatusTooltip: React.FC<SyncStatusTooltipProps> = ({
  steps,
  isSyncing,
  lastSyncedAt,
}) => {
  const stepList = [
    steps.sigaa,
    steps.aprender3,
    steps.teams,
    steps.myCourse,
    steps.ghPages,
    steps.planilha,
  ];

  return (
    <div className="w-80 p-3 space-y-3 bg-canvas text-black select-none">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between border-b-2 border-black pb-2">
        <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider">
          <span>Status da Sincronização</span>
        </div>
      </div>

      {/* Lista das 4 sincronizações */}
      <div className="space-y-2">
        {stepList.map((step) => {
          const Icon = STEP_ICONS[step.id];

          return (
            <div
              key={step.id}
              className="p-2 rounded-lg border border-black/15 bg-canvas hover:bg-neutral-100 transition-colors flex items-start gap-2.5"
            >
              <div className="p-1 rounded bg-canvas border border-black/15 shrink-0 mt-0.5">
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
                      ? "text-rose-600 font-semibold"
                      : step.status === "success"
                        ? "text-emerald-700 font-medium"
                        : step.status === "syncing"
                          ? "text-neo-blue font-semibold"
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
      <div className="pt-2 border-t border-black/10 flex items-center justify-between text-[10px] text-neutral-600 font-semibold">
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
