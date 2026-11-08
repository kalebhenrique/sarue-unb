import * as React from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  variant?: 'yellow' | 'green' | 'blue' | 'neutral' | 'destructive';
  aside?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({
  icon: Icon,
  title,
  description,
  variant = 'yellow',
  className,
  children,
  aside,
  ...props
}) => {
  const variantStyles = {
    // Post-it escuro vira placa elevada com fita lateral na cor de ação:
    // superfície do papel + barra esquerda grossa (6px) na tinta viva correspondente.
    yellow:
      'bg-pastel-yellow border-ink text-black dark:bg-paper dark:border-l-[6px] dark:border-l-neo-yellow',
    green:
      'bg-pastel-green border-ink text-black dark:bg-paper dark:border-l-[6px] dark:border-l-neo-green',
    blue:
      'bg-pastel-blue border-ink text-black dark:bg-paper dark:border-l-[6px] dark:border-l-neo-blue',
    neutral: 'bg-paper border-ink text-black',
    destructive:
      'bg-pastel-red border-ink text-black dark:bg-paper dark:border-l-[6px] dark:border-l-neo-danger',
  };

  const iconStyles = {
    // No escuro, o selo do ícone vira adesivo sólido da respectiva tinta com tinta preta fixa
    // ou branco na tinta destrutiva — detalhe vivo do banner neobrutalista.
    yellow: 'bg-paper text-black dark:bg-neo-yellow dark:text-ink',
    green: 'bg-paper text-ink-success dark:bg-neo-green dark:text-ink',
    blue: 'bg-paper text-blue-ink dark:bg-neo-blue dark:text-white',
    neutral: 'bg-paper text-black',
    destructive: 'bg-neo-danger text-white dark:bg-neo-danger dark:text-white',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3.5 p-4 border-2 border-ink rounded-lg shadow-(--neo-card-shadow)',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {Icon ? (
        <div
          className={cn(
            'p-2 border-2 border-ink rounded-lg shadow-[2px_2px_0px_0px_var(--neo-shadow)] shrink-0',
            iconStyles[variant]
          )}
        >
          <Icon className="w-4 h-4 stroke-[2.5]" />
        </div>
      ) : null}
      <div className="flex flex-col flex-1 min-w-0">
        <h4 className="text-sm font-bold tracking-tight text-black">{title}</h4>
        {description ? (
          typeof description === 'string' ? (
            <p className="text-xs font-semibold text-neutral-800 mt-1 leading-relaxed text-balance">{description}</p>
          ) : (
            <div className="text-xs font-semibold text-neutral-800 mt-1 leading-relaxed">{description}</div>
          )
        ) : null}
        {children}
      </div>
      {aside ? <div className="shrink-0 self-center">{aside}</div> : null}
    </div>
  );
};
