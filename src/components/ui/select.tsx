import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('flex flex-1 items-center gap-2 text-left truncate min-w-0 overflow-hidden', className)}
      {...props}
    >
      {children}
    </SelectPrimitive.Value>
  );
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex h-10 w-full min-w-0 items-center justify-between rounded-xl border-2 border-ink bg-paper dark:bg-neutral-200 dark:text-slate-50 dark:hover:bg-neutral-300 gap-2 px-3 py-2 text-xs font-bold text-black focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[box-shadow,border-color] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 select-none overflow-hidden',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDown className="w-4 h-4 stroke-[2.5] shrink-0" />} />
    </SelectPrimitive.Trigger>
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up"
      className={cn(
        'top-0 z-10 flex w-full cursor-default items-center justify-center bg-canvas py-1 text-black',
        className
      )}
      {...props}
    >
      <ChevronUp className="w-4 h-4 stroke-[2.5]" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down"
      className={cn(
        'bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-canvas py-1 text-black',
        className
      )}
      {...props}
    >
      <ChevronDown className="w-4 h-4 stroke-[2.5]" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof SelectPrimitive.Positioner>,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'relative z-50 max-h-[min(24rem,var(--available-height))] min-w-(--anchor-width) overflow-x-hidden overflow-y-auto rounded-lg border-2 border-ink bg-canvas text-black outline-hidden origin-(--transform-origin) data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95',
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List data-slot="select-list" className="p-1 space-y-0.5">
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(
        'py-1.5 pr-8 pl-2 text-xs font-black uppercase tracking-wider text-neutral-600',
        className
      )}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-xs font-bold border-2 border-transparent outline-hidden hover:bg-neo-blue hover:text-white hover:border-ink focus:bg-neo-blue focus:text-white focus:border-ink data-highlighted:bg-neo-blue data-highlighted:text-white data-highlighted:border-ink data-disabled:pointer-events-none data-disabled:opacity-50 transition-colors',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText
        data-slot="select-item-text"
        className="flex flex-1 items-center gap-2 whitespace-nowrap truncate"
      >
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        render={
          <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center" />
        }
      >
        <Check className="w-4 h-4 stroke-[2.5]" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('-mx-1 my-1 h-px bg-neutral-200', className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
