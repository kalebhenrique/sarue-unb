import React, { useEffect, useRef, useState } from "react";
import type { FlowchartMetrics } from "@/core";
import {
  Award,
  BookOpen,
  Calculator,
  Clock,
  Pencil,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  BottomSheet,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export interface FlowchartStatsProps {
  metrics: FlowchartMetrics;
  onOpenIraCalculator?: () => void;
  canEditIntegralization?: boolean;
  hasCustomIntegralization?: boolean;
  onSaveIntegralization?: (value?: number) => Promise<boolean> | boolean | void;
}

function formatEditablePercent(value: number): string {
  return value.toFixed(1).replace(".0", "").replace(".", ",");
}

function parseEditablePercent(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/%/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return Math.round(num * 10) / 10;
}

export const FlowchartStats: React.FC<FlowchartStatsProps> = ({
  metrics,
  onOpenIraCalculator,
  canEditIntegralization = false,
  hasCustomIntegralization = false,
  onSaveIntegralization,
}) => {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rawPercentual =
    metrics.percentualIntegralizado ?? metrics.mandatoryProgressPercentage;
  const percentual = Number.isFinite(rawPercentual)
    ? Math.max(0, Math.min(100, rawPercentual))
    : 0;
  const obrigatoriaTotal = metrics.chObrigatoriaTotal;
  const totalCurriculo = Math.max(
    metrics.chTotalCurriculo ?? metrics.totalHours ?? 0,
    obrigatoriaTotal ?? 0,
  );
  const obrigatoriaPendente = metrics.chObrigatoriaPendente;
  const optativaPendente = metrics.chOptativaPendente;

  const showEditButton =
    canEditIntegralization &&
    !metrics.isAlternativeCurriculum &&
    Boolean(onSaveIntegralization);

  const chConcluidaObrigatoria =
    obrigatoriaTotal && obrigatoriaTotal > 0 && obrigatoriaPendente != null
      ? Math.max(0, obrigatoriaTotal - obrigatoriaPendente)
      : Math.max(0, metrics.completedHours);

  const chTotalObrigatoriaExibida =
    obrigatoriaTotal && obrigatoriaTotal > 0
      ? obrigatoriaTotal
      : metrics.chObrigatoriaTotal && metrics.chObrigatoriaTotal > 0
        ? metrics.chObrigatoriaTotal
        : metrics.totalHours > 0
          ? metrics.totalHours
          : undefined;

  const handleOpenEdit = () => {
    setInputValue(formatEditablePercent(percentual));
    setValidationError(null);
    setIsEditOpen(true);
  };

  const handleCloseEdit = () => {
    if (isSaving) return;
    setIsEditOpen(false);
    setValidationError(null);
  };

  useEffect(() => {
    if (!isEditOpen) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditOpen]);

  const handleSubmitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSaveIntegralization || isSaving) return;

    const parsed = parseEditablePercent(inputValue);
    if (parsed === null) {
      setValidationError("Informe um número entre 0 e 100 (ex.: 64,5).");
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    try {
      const ok = await onSaveIntegralization(parsed);
      if (ok !== false) {
        setIsEditOpen(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreAutomatic = async () => {
    if (!onSaveIntegralization || isSaving) return;
    setValidationError(null);
    setIsSaving(true);
    try {
      const ok = await onSaveIntegralization(undefined);
      if (ok !== false) {
        setIsEditOpen(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const editButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleOpenEdit}
      aria-label="Editar integralização total"
      title="Editar integralização total"
      className="shrink-0"
    >
      <Pencil className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
      <span>Editar</span>
    </Button>
  );

  const editFormFields = (
    <div className="space-y-3">
      {validationError && (
        <div
          id="integralization-percent-error"
          role="alert"
          className="p-3 rounded-lg border-2 border-ink bg-pastel-red text-black text-xs font-bold"
        >
          {validationError}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="integralization-percent-input"
          className="text-xs font-black uppercase tracking-wider text-black block"
        >
          Percentual integralizado
        </label>

        <div className="relative">
          <input
            ref={inputRef}
            id="integralization-percent-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="Ex.: 64,5"
            aria-invalid={Boolean(validationError)}
            aria-describedby={
              validationError
                ? "integralization-percent-error"
                : "integralization-percent-hint"
            }
            className="w-full h-10 pl-3.5 pr-9 text-sm font-bold tabular-nums text-black bg-paper border-2 border-ink rounded-xl placeholder:text-neutral-500 focus:outline-hidden focus:ring-2 focus:ring-neo-blue"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-neutral-500"
          >
            %
          </span>
        </div>

        <p
          id="integralization-percent-hint"
          className="text-xs font-semibold text-neutral-600 leading-snug"
        >
          Informe o percentual total exibido no portal do SIGAA (0% a 100%).
        </p>
      </div>

      {hasCustomIntegralization && (
        <div>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleRestoreAutomatic}
            className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold underline decoration-2 underline-offset-2 text-neutral-600 hover:text-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue rounded-xs py-0.5 disabled:opacity-50"
          >
            <RotateCcw
              className="w-3.5 h-3.5 stroke-[2.5]"
              aria-hidden="true"
            />
            Restaurar cálculo automático
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4 mb-4 md:mb-6">
        <div className="col-span-2 lg:col-span-1 bg-paper border-2 border-ink rounded-xl p-3.5 md:p-4 shadow-neo-sm md:shadow-neo flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-neutral-600">
              {metrics.isAlternativeCurriculum
                ? "Simulação de Matriz"
                : canEditIntegralization || metrics.isSimulated
                  ? "Integralização"
                  : "Integralização SIGAA"}
            </span>
            <div
              className={`w-8 h-8 rounded-lg border-2 border-ink flex items-center justify-center text-ink ${
                metrics.isAlternativeCurriculum
                  ? "bg-neo-yellow"
                  : "bg-neo-green"
              }`}
            >
              {metrics.isAlternativeCurriculum ? (
                <Sparkles className="w-4 h-4 stroke-[2.5]" />
              ) : (
                <Award className="w-4 h-4 stroke-[2.5]" />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-3xl font-black text-black tabular-nums">
                  {percentual.toFixed(1).replace(".0", "")}%
                </span>
                <span className="text-xs font-bold text-neutral-600 truncate">
                  {metrics.isAlternativeCurriculum
                    ? "simulado"
                    : metrics.isSimulated
                      ? "projetado"
                      : "integralizado"}
                </span>
              </div>

              {showEditButton && <div className="lg:hidden">{editButton}</div>}
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

          <div className="mt-2">
            <p className="text-[11px] font-bold text-neutral-600">
              {metrics.completedMandatoryDisciplines} de{" "}
              {metrics.totalMandatoryDisciplines} obrigatórias feitas
            </p>
            {showEditButton && (
              <div className="hidden lg:block mt-2">{editButton}</div>
            )}
          </div>
        </div>

        <div className="col-span-1 bg-paper border-2 border-ink rounded-xl p-3 md:p-4 shadow-neo-sm md:shadow-neo flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[11px] md:text-xs font-black uppercase tracking-wider text-neutral-600">
              CH Obrigatória
            </span>
            <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 rounded-lg bg-sticker-blue border-2 border-ink flex items-center justify-center text-ink">
              <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 stroke-[2.5]" />
            </div>
          </div>

          <div className="flex items-baseline gap-1.5 mb-1 flex-wrap">
            <span className="text-2xl md:text-3xl font-black text-black">
              {chConcluidaObrigatoria}h
            </span>
            {chTotalObrigatoriaExibida != null && (
              <span className="text-[11px] md:text-xs font-bold text-neutral-600">
                de {chTotalObrigatoriaExibida}h
              </span>
            )}
          </div>

          <p className="text-[11px] font-bold text-neutral-600 mt-1.5 md:mt-2">
            Pendente:{" "}
            <span className="text-black font-extrabold">
              {obrigatoriaPendente != null
                ? `${obrigatoriaPendente}h`
                : `${metrics.remainingHours}h`}
            </span>{" "}
            obrig.
          </p>
        </div>

        <div className="col-span-1 bg-paper border-2 border-ink rounded-xl p-3 md:p-4 shadow-neo-sm md:shadow-neo flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[11px] md:text-xs font-black uppercase tracking-wider text-neutral-600">
              CH Total do Curso
            </span>
            <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 rounded-lg bg-neo-yellow border-2 border-ink flex items-center justify-center text-ink">
              <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 stroke-[2.5]" />
            </div>
          </div>

          <div className="flex items-baseline gap-1.5 mb-1 flex-wrap">
            <span className="text-2xl md:text-3xl font-black text-black">
              {totalCurriculo}h
            </span>
            <span className="text-[11px] md:text-xs font-bold text-neutral-600">
              currículo
            </span>
          </div>

          <p className="text-[11px] font-bold text-neutral-600 mt-1.5 md:mt-2">
            Optativas pend.:{" "}
            <span className="text-black font-extrabold">
              {optativaPendente != null ? `${optativaPendente}h` : "---"}
            </span>
          </p>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-paper border-2 border-ink rounded-xl p-3.5 md:p-4 shadow-neo-sm md:shadow-neo flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-neutral-600">
              Índices Acadêmicos
            </span>
            <div className="w-8 h-8 rounded-lg bg-neo-purple border-2 border-ink flex items-center justify-center text-ink">
              <BookOpen className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap lg:block">
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

            <div className="lg:mt-2">
              <Button variant="yellow" size="sm" onClick={onOpenIraCalculator}>
                <Calculator className="w-3.5 h-3.5 stroke-[2.5]" />
                Calculadora de IRA
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showEditButton && isMobile && (
        <BottomSheet
          open={isEditOpen}
          onClose={handleCloseEdit}
          role="dialog"
          aria-label="Editar integralização total"
          backdrop
          backdropClassName="z-40 md:hidden"
          className="fixed inset-x-0 bottom-0 w-full z-50 md:hidden"
          portal
          dragOnlyOnHandle
        >
          <form
            onSubmit={handleSubmitEdit}
            className="px-4 max-h-[calc(85dvh-2rem)] overflow-y-auto overflow-x-hidden pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4"
          >
            <div className="flex items-center gap-2.5 pb-3 border-b-2 border-black/10">
              <div
                className="w-8 h-8 rounded-lg bg-neo-green border-2 border-ink flex items-center justify-center text-ink shrink-0"
                aria-hidden="true"
              >
                <Award className="w-4 h-4 stroke-[2.5]" />
              </div>
              <h2 className="text-base font-black text-black">
                Editar integralização total
              </h2>
            </div>

            {editFormFields}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={isSaving}
                onClick={handleCloseEdit}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSaving}
              >
                Salvar
              </Button>
            </div>
          </form>
        </BottomSheet>
      )}

      {showEditButton && !isMobile && (
        <Dialog
          open={isEditOpen}
          onOpenChange={(open) => {
            if (!open) handleCloseEdit();
          }}
        >
          <DialogContent showCloseButton={!isSaving} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar integralização total</DialogTitle>
              <DialogDescription>
                O PDF do histórico não informa a porcentagem exata do SIGAA.
                Ajuste o valor para refletir sua integralização atual.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmitEdit} className="space-y-4">
              {editFormFields}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  disabled={isSaving}
                  onClick={handleCloseEdit}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSaving}
                >
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
