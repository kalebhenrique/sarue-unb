import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * NumberField Root - gerencia estado e contexto do campo numérico.
 */
export const NumberField = NumberFieldPrimitive.Root;

/**
 * Container agrupador para o input e botões de incremento/decremento.
 */
export function NumberFieldGroup({
  className,
  ...props
}: React.ComponentProps<typeof NumberFieldPrimitive.Group>) {
  return (
    <NumberFieldPrimitive.Group
      data-slot="number-field-group"
      className={cn(
        "relative flex w-full items-center rounded-xl border-2 border-ink bg-paper shadow-neo-xs transition-[box-shadow,border-color] focus-within:ring-2 focus-within:ring-neo-blue overflow-hidden",
        className
      )}
      {...props}
    />
  );
}

/**
 * Normaliza strings numéricas substituindo '.' por ',' para digitação transparente em pt-BR.
 */
export function normalizeDecimalSeparator(input: string): string {
  return input.replace(/\./g, ",");
}

/**
 * Converte string com '.' ou ',' para float válido no domínio de notas (0 a 10).
 */
export function parseGradeInput(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Suporta tanto 7.5 quanto 7,5
  const normalized = trimmed.replace(/\s+/g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

type NumberFieldInputProps = React.ComponentProps<typeof NumberFieldPrimitive.Input>;

/**
 * Input numérico de alto contraste sem os spinbuttons nativos quebrados do navegador.
 * Suporta normalização transparente de '.' para ',' em teclados pt-BR.
 */
export function NumberFieldInput({
  className,
  onKeyDown,
  onPaste,
  ...props
}: NumberFieldInputProps) {
  const handleKeyDown: NumberFieldInputProps["onKeyDown"] = (e) => {
    // Em pt-BR, usuários digitam tanto ',' quanto '.' (ex.: teclado numérico).
    // Intercepta '.' para inserir ',' de forma nativa e evitar interpretação errônea.
    if (e.key === ".") {
      const input = e.currentTarget;
      const val = input.value;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const hasDecimal = val.includes(",") || val.includes(".");
      const isReplacing =
        start !== end &&
        (val.slice(start, end).includes(",") || val.slice(start, end).includes("."));

      if (!hasDecimal || isReplacing) {
        e.preventDefault();
        try {
          if (!document.execCommand("insertText", false, ",")) {
            const nextVal = val.slice(0, start) + "," + val.slice(end);
            input.value = nextVal;
            input.setSelectionRange(start + 1, start + 1);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        } catch {
          const nextVal = val.slice(0, start) + "," + val.slice(end);
          input.value = nextVal;
          input.setSelectionRange(start + 1, start + 1);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
    }
    onKeyDown?.(e);
  };

  const handlePaste: NumberFieldInputProps["onPaste"] = (e) => {
    const text = e.clipboardData.getData("text");
    if (text.includes(".")) {
      e.preventDefault();
      const normalized = normalizeDecimalSeparator(text);
      try {
        if (!document.execCommand("insertText", false, normalized)) {
          const input = e.currentTarget;
          const val = input.value;
          const start = input.selectionStart ?? 0;
          const end = input.selectionEnd ?? 0;
          const nextVal = val.slice(0, start) + normalized + val.slice(end);
          input.value = nextVal;
          input.setSelectionRange(start + normalized.length, start + normalized.length);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch {
        const input = e.currentTarget;
        const val = input.value;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const nextVal = val.slice(0, start) + normalized + val.slice(end);
        input.value = nextVal;
        input.setSelectionRange(start + normalized.length, start + normalized.length);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    onPaste?.(e);
  };

  return (
    <NumberFieldPrimitive.Input
      data-slot="number-field-input"
      className={cn(
        "w-full min-w-0 bg-transparent px-2.5 py-1 text-sm font-bold text-black placeholder:text-neutral-500 focus:outline-hidden text-center font-mono tabular-nums",
        // Suprime completamente os spinbuttons nativos do WebKit/Chromium/Firefox/WebKitGTK
        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        className
      )}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      {...props}
    />
  );
}

/**
 * Botão de incremento com estilo neobrutalista.
 */
export function NumberFieldIncrement({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NumberFieldPrimitive.Increment>) {
  return (
    <NumberFieldPrimitive.Increment
      data-slot="number-field-increment"
      className={cn(
        "flex h-full items-center justify-center text-black hover:bg-neutral-100 dark:hover:bg-neutral-200 active:bg-neutral-200 transition-colors cursor-pointer select-none disabled:opacity-30 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children || <Plus className="w-3 h-3 stroke-[2.5]" />}
    </NumberFieldPrimitive.Increment>
  );
}

/**
 * Botão de decremento com estilo neobrutalista.
 */
export function NumberFieldDecrement({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NumberFieldPrimitive.Decrement>) {
  return (
    <NumberFieldPrimitive.Decrement
      data-slot="number-field-decrement"
      className={cn(
        "flex h-full items-center justify-center text-black hover:bg-neutral-100 dark:hover:bg-neutral-200 active:bg-neutral-200 transition-colors cursor-pointer select-none disabled:opacity-30 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children || <Minus className="w-3 h-3 stroke-[2.5]" />}
    </NumberFieldPrimitive.Decrement>
  );
}

export interface NumberInputProps {
  id?: string;
  value?: number | null;
  defaultValue?: number;
  onValueChange?: (val: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  smallStep?: number;
  /** Locale para formatação e parsing (padrão pt-BR) */
  locale?: string;
  /** Opções de formatação Intl (padrão: useGrouping: false) */
  format?: Intl.NumberFormatOptions;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  /**
   * "stacked": botões de seta em cima/baixo no lado direito com divisor neobrutalista
   * "sides": botão de menos na esquerda e mais na direita
   * "none": apenas o input estilizado sem controles visuais
   */
  controls?: "stacked" | "sides" | "none";
}

/**
 * Componente pronto de Input Numérico Neobrutalista do Saruê UnB.
 * Resolve problemas de spinbutton nativo quebrado e suporte a decimais em pt-BR.
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  id,
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 10,
  step = 0.5,
  smallStep = 0.1,
  locale = "pt-BR",
  format = { useGrouping: false },
  placeholder = "Pendente",
  disabled = false,
  className,
  inputClassName,
  "aria-label": ariaLabel,
  controls = "stacked",
}) => {
  return (
    <NumberField
      id={id}
      value={value}
      defaultValue={defaultValue}
      locale={locale}
      format={format}
      onValueChange={(val) => {
        onValueChange?.(val);
      }}
      min={min}
      max={max}
      step={step}
      smallStep={smallStep}
      disabled={disabled}
      className={cn("w-full", className)}
    >
      <NumberFieldGroup className="h-9 bg-paper">
        {controls === "sides" && (
          <NumberFieldDecrement
            className="w-8 border-r-2 border-ink bg-neutral-100 dark:bg-btn-raise text-black shrink-0"
            aria-label="Diminuir valor"
          >
            <Minus className="w-3 h-3 stroke-[2.5]" />
          </NumberFieldDecrement>
        )}

        <NumberFieldInput
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={inputClassName}
        />

        {controls === "sides" && (
          <NumberFieldIncrement
            className="w-8 border-l-2 border-ink bg-neutral-100 dark:bg-btn-raise text-black shrink-0"
            aria-label="Aumentar valor"
          >
            <Plus className="w-3 h-3 stroke-[2.5]" />
          </NumberFieldIncrement>
        )}

        {controls === "stacked" && (
          <div className="flex flex-col h-full w-6 border-l-2 border-ink divide-y-2 divide-ink shrink-0 bg-neutral-100 dark:bg-btn-raise">
            <NumberFieldIncrement
              className="flex-1 w-full text-black hover:bg-neutral-200 dark:hover:bg-neutral-300"
              aria-label="Aumentar valor"
            >
              <ChevronUp className="w-3 h-3 stroke-[2.5]" />
            </NumberFieldIncrement>
            <NumberFieldDecrement
              className="flex-1 w-full text-black hover:bg-neutral-200 dark:hover:bg-neutral-300"
              aria-label="Diminuir valor"
            >
              <ChevronDown className="w-3 h-3 stroke-[2.5]" />
            </NumberFieldDecrement>
          </div>
        )}
      </NumberFieldGroup>
    </NumberField>
  );
};
