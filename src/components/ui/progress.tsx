import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressProps
  extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  /** Quantidade de etapas para exibir ícones de check contínuos ao longo da barra. */
  stepsCount?: number;
  /** Quantidade de etapas concluídas sequencialmente (da esquerda para a direita). */
  completedSteps?: number;
}

/**
 * Progress do design system Saruê (adaptado do registro neobrutalism.dev):
 * trilho-cavidade com borda preta de 2px, preenchimento Verde Giz (`bg-neo-green`)
 * e marcos opcionais de check posicionados ao final de cada etapa (`(i + 1) / N`).
 */
function Progress({
  className,
  value,
  stepsCount,
  completedSteps = 0,
  ...props
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value ?? 0));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      className={cn("relative w-full", className)}
      {...props}
    >
      <div className="relative flex items-center w-full py-1.5 pr-2.5">
        <ProgressPrimitive.Track
          data-slot="progress-track"
          className="relative h-3.5 w-full overflow-hidden rounded-full border-2 border-ink bg-paper"
        >
          <ProgressPrimitive.Indicator
            data-slot="progress-indicator"
            className="h-full w-full flex-1 bg-neo-green border-r-2 border-ink transition-transform duration-300 ease-out"
            style={{
              transform: `translateX(-${100 - clamped}%)`,
              width: "100%",
            }}
          />
        </ProgressPrimitive.Track>

        {stepsCount && stepsCount > 0 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 right-2.5"
          >
            {Array.from({ length: stepsCount }, (_, index) => {
              const isDone = index < completedSteps;
              const positionPercent = ((index + 1) / stepsCount) * 100;
              return (
                <span
                  key={index}
                  style={{ left: `${positionPercent}%` }}
                  className={cn(
                    "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-ink flex items-center justify-center transition-colors duration-300",
                    isDone
                      ? "bg-neo-green text-ink shadow-neo-xs"
                      : "bg-paper text-neutral-400",
                  )}
                >
                  <Check
                    className={cn(
                      "w-3 h-3 stroke-[3] transition-opacity duration-200",
                      isDone ? "opacity-100" : "opacity-35",
                    )}
                  />
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
