import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Título da página; aceita nó para trechos estilizados. */
  title: React.ReactNode;
  /** Complemento do título em fonte menor (ex.: contagem de resultados, horário). */
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4",
        className,
      )}
      {...props}
    >
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold text-black tracking-tight flex items-center flex-wrap gap-x-2.5 gap-y-1">
          {Icon ? (
            <Icon className="hidden md:block size-4 stroke-[2.5] shrink-0 text-blue-ink" />
          ) : null}
          <span>{title}</span>
          {subtitle ? (
            <span className="text-sm font-bold text-neutral-500">
              {subtitle}
            </span>
          ) : null}
        </h1>
      </div>
      {actions ? (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </div>
  );
};
