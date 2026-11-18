import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import * as React from 'react';
import { cn } from '@/lib/utils';

/* Porta Base UI do menu de contexto, no vocabulário adesivo do mundo:
   popup = papel quadriculado (bg-canvas) SEM sombra, como tooltips e o popup
   do Select na Grade; item acende o Azul Caneta Ação no hover/teclado. */

function DropdownMenu(props: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  side = 'bottom',
  align = 'end',
  sideOffset = 4,
  alignOffset = 0,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Popup> &
  Pick<React.ComponentProps<typeof MenuPrimitive.Positioner>, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} alignOffset={alignOffset} className="isolate z-50">
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'relative z-50 min-w-[220px] md:min-w-[200px] max-h-[min(24rem,var(--available-height))] overflow-y-auto overflow-x-hidden rounded-lg border-2 border-ink bg-canvas text-black p-1.5 space-y-0.5 md:p-1 md:space-y-0 outline-hidden origin-[var(--transform-origin)]',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2.5 md:gap-2 rounded-lg min-h-11 md:min-h-0 px-3.5 py-2.5 md:px-2.5 md:py-1.5 text-sm md:text-xs font-bold text-black outline-hidden hover:bg-neo-blue hover:text-white data-highlighted:bg-neo-blue data-highlighted:text-white data-disabled:pointer-events-none data-disabled:opacity-50 transition-colors [&_svg]:shrink-0 [&_svg]:stroke-[2.5] [&_svg]:size-4 md:[&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('-mx-1 my-1.5 md:my-1 h-px bg-neutral-200', className)} {...props} />;
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.GroupLabel>) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn('py-1.5 px-2.5 text-[11px] font-black uppercase tracking-wider text-neutral-500', className)}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel };
