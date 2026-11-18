import * as React from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HeaderIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Exibe indicador azul de filtro ativo no canto superior direito. */
  hasActiveIndicator?: boolean;
  /** Variante de cor (default: papel, active: azul caneta). */
  active?: boolean;
}

/**
 * Botão de ícone compacto neobrutalista para barras de topo e busca mobile:
 * caixa visual de 40×40px com área de toque estendida de 48×48px.
 */
export const HeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  HeaderIconButtonProps
>(
  (
    {
      className,
      hasActiveIndicator = false,
      active = false,
      type = "button",
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "relative cursor-pointer shrink-0 h-10 w-10 rounded-xl border-2 border-ink flex items-center justify-center shadow-neo-sm transition-[transform,box-shadow,background-color,color] duration-150 ease-out",
          "hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "after:content-[''] after:absolute after:-inset-1",
          active
            ? "bg-neo-blue text-white hover:bg-neo-blueHover"
            : "bg-paper dark:bg-btn-raise text-black hover:bg-neutral-100",
          className,
        )}
        {...props}
      >
        {children}
        {hasActiveIndicator ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-neo-yellow border-2 border-ink"
          />
        ) : null}
      </button>
    );
  },
);
HeaderIconButton.displayName = "HeaderIconButton";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Título da página; aceita nó para trechos estilizados. */
  title: React.ReactNode;
  /** Complemento do título em fonte menor no desktop (ex.: contagem de resultados, horário). */
  subtitle?: React.ReactNode;
  /** Contagem compacta exibida ao lado do título em pill no mobile (ex.: 42). */
  count?: number | string | null;
  icon?: LucideIcon;
  /** Ações exibidas à direita (ocultas abaixo de md quando mobileActions ou onBack forem informados). */
  actions?: React.ReactNode;
  /** Ações compactas à direita exclusivas do mobile (< md), tipicamente botão MoreVertical. */
  mobileActions?: React.ReactNode;
  /** Handler de retorno para subpáginas; no mobile renderiza botão ArrowLeft compacto à esquerda. */
  onBack?: () => void;
  /** Rótulo acessível para o botão de voltar no mobile. Padrão: "Voltar". */
  backLabel?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  count,
  icon: Icon,
  actions,
  mobileActions,
  onBack,
  backLabel = "Voltar",
  className,
  ...props
}) => {
  const isStringTitle = typeof title === "string";
  const isLongTitle = isStringTitle && title.trim().length > 25;
  const hasCount = count !== undefined && count !== null && count !== "";
  const hideDesktopActionsOnMobile = Boolean(mobileActions || onBack);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 md:gap-4 min-h-10 md:min-h-0",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onBack ? (
          <HeaderIconButton
            onClick={onBack}
            aria-label={backLabel}
            className="md:hidden"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
          </HeaderIconButton>
        ) : null}

        {Icon ? (
          <Icon className="hidden md:block size-4 stroke-[2.5] shrink-0 text-blue-ink" />
        ) : null}

        <div className="flex items-center gap-2 min-w-0">
          <h1
            className={cn(
              "font-bold md:font-extrabold text-black tracking-tight min-w-0 md:text-2xl md:leading-tight md:line-clamp-none",
              isStringTitle
                ? isLongTitle
                  ? "text-base leading-tight line-clamp-2"
                  : "text-lg leading-tight line-clamp-1"
                : "text-lg leading-tight",
            )}
          >
            {title}
          </h1>

          {hasCount ? (
            <span
              className="md:hidden inline-flex items-center shrink-0 rounded-full border-2 border-ink bg-paper dark:bg-neutral-300 px-2 py-0.5 text-xs font-extrabold text-black tabular-nums"
              aria-label={`Total: ${count}`}
            >
              {count}
            </span>
          ) : null}

          {subtitle ? (
            <span
              className={cn(
                "shrink-0 text-xs sm:text-sm font-bold text-neutral-500",
                hasCount ? "hidden md:inline" : "inline",
              )}
            >
              {subtitle}
            </span>
          ) : null}
        </div>
      </div>

      {mobileActions ? (
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          {mobileActions}
        </div>
      ) : null}

      {actions ? (
        <div
          className={cn(
            "items-center gap-2 shrink-0",
            hideDesktopActionsOnMobile ? "hidden md:flex" : "flex",
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
};
