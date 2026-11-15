import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FloatingActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Ícone exibido dentro do adesivo flutuante (ou passe children customizados). */
  icon?: LucideIcon;
  /** Rótulo opcional para transformar o quadrado arredondado em CTA estendido. */
  label?: string;
  /** Paleta de destaque neobrutalista (padrão: 'primary' azul do sistema). */
  variant?: 'primary' | 'accent' | 'yellow' | 'outline';
  /** Canto fixo da viewport (padrão: 'bottom-right'). */
  position?: 'bottom-right' | 'bottom-left';
  /** Obrigatório para acessibilidade em botões flutuantes de ação. */
  'aria-label': string;
}

const VARIANT_CLASSES: Record<
  NonNullable<FloatingActionButtonProps['variant']>,
  string
> = {
  accent: 'bg-neo-green text-ink hover:bg-neo-greenHover',
  primary: 'bg-neo-blue text-white hover:bg-neo-blueHover',
  yellow: 'bg-neo-yellow text-ink hover:bg-neo-yellowHover',
  outline: 'bg-paper dark:bg-btn-raise text-black hover:bg-neutral-100',
};

const POSITION_CLASSES: Record<
  NonNullable<FloatingActionButtonProps['position']>,
  string
> = {
  // No mobile respeita a barra inferior (4rem) + safe-area; no desktop fica ao lado do FeedbackWidget (bottom-4 right-4, 40px)
  'bottom-right':
    'right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 md:right-[4.5rem]',
  'bottom-left':
    'left-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-4',
};

/**
 * Botão de ação flutuante (FAB) reutilizável no formato quadrado arredondado
 * neobrutalista com física de adesivo.
 */
export const FloatingActionButton = React.forwardRef<
  HTMLButtonElement,
  FloatingActionButtonProps
>(
  (
    {
      icon: Icon,
      label,
      variant = 'primary',
      position = 'bottom-right',
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const isExtended = Boolean(label);

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'cursor-pointer fixed z-30 inline-flex items-center justify-center gap-2 font-black tracking-tight select-none',
          'border-2 border-ink rounded-2xl',
          'translate-x-0 translate-y-0',
          'shadow-[1px_1px_0px_0px_var(--neo-shadow),0_4px_12px_rgba(0,0,0,0.2)] dark:shadow-[1px_1px_0px_0px_var(--neo-shadow),0_6px_16px_rgba(0,0,0,0.42)]',
          'hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.22)] dark:hover:shadow-[0_3px_10px_rgba(0,0,0,0.45)]',
          'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2',
          'transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[1px_1px_0px_0px_var(--neo-shadow),0_4px_12px_rgba(0,0,0,0.2)]',
          isExtended ? 'h-14 px-5 text-sm' : 'h-14 w-14 p-0',
          VARIANT_CLASSES[variant],
          POSITION_CLASSES[position],
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            {Icon && <Icon className="h-6 w-6 shrink-0 stroke-[2.5]" />}
            {label && <span>{label}</span>}
          </>
        )}
      </button>
    );
  },
);

FloatingActionButton.displayName = 'FloatingActionButton';
