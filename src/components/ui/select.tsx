import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/** Breakpoint `md` do Tailwind (768px). Abaixo disso o Select abre como bottom sheet. */
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

/**
 * Estado de abertura compartilhado com as partes internas (SelectContent precisa
 * saber `open` real para animar o BottomSheet e controlar a desmontagem do Portal
 * após a animação de saída; Base UI não expõe o store do Root).
 */
interface SelectOpenContextValue {
  isSelectOpen: boolean;
  setSelectOpen: (open: boolean) => void;
  unmountSelect: () => void;
}

const SelectOpenContext = React.createContext<SelectOpenContextValue>({
  isSelectOpen: false,
  setSelectOpen: () => {},
  unmountSelect: () => {},
});

/**
 * Wrapper controlável do Root: mantém o estado de abertura (quando não controlado
 * externamente) e o publica via contexto para o BottomSheet animar corretamente
 * em mobile (entrada/subida e saída/descida a cada abertura).
 */
function Select<Value = unknown>({
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  actionsRef: actionsRefProp,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root<Value>>) {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const internalActionsRef = React.useRef<SelectPrimitive.Root.Actions | null>(null);
  React.useImperativeHandle(
    actionsRefProp,
    () => ({
      unmount: () => {
        internalActionsRef.current?.unmount();
      },
    }),
    []
  );

  const [uncontrolledOpen, setUncontrolledOpen] =
    React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (open: boolean, details?: unknown) => {
      if (!isControlled) setUncontrolledOpen(open);
      onOpenChange?.(open, details as never);
    },
    [isControlled, onOpenChange]
  );

  const unmountSelect = React.useCallback(() => {
    internalActionsRef.current?.unmount();
  }, []);

  const contextValue = React.useMemo(
    () => ({ isSelectOpen: isOpen, setSelectOpen: handleOpenChange, unmountSelect }),
    [isOpen, handleOpenChange, unmountSelect]
  );

  return (
    <SelectOpenContext.Provider value={contextValue}>
      <SelectPrimitive.Root
        open={isOpen}
        onOpenChange={handleOpenChange}
        actionsRef={isMobile ? internalActionsRef : actionsRefProp}
        {...props}
      />
    </SelectOpenContext.Provider>
  );
}

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
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const { isSelectOpen, setSelectOpen, unmountSelect } =
    React.useContext(SelectOpenContext);
  const isSelectOpenRef = React.useRef(isSelectOpen);

  React.useEffect(() => {
    isSelectOpenRef.current = isSelectOpen;
  }, [isSelectOpen]);

  const list = (
    <SelectPrimitive.List
      data-slot="select-list"
      className={cn(
        'p-1 space-y-0.5',
        // Mobile (bottom sheet): tipografia e alvos de toque maiores
        isMobile &&
          '[&_[data-slot=select-item]]:text-sm [&_[data-slot=select-item]]:py-3.5 [&_[data-slot=select-item]]:px-4 [&_[data-slot=select-item-text]]:text-sm [&_[data-slot=select-item]]:min-h-12'
      )}
    >
      {children}
    </SelectPrimitive.List>
  );

  return (
    <SelectPrimitive.Portal>
      {isMobile ? (
        // Em mobile o Positioner vira display:contents: preserva o contexto
        // exigido por Popup/List, mas abandona o box posicionado por âncora.
        // O BottomSheet assume o posicionamento fixo no rodapé em largura cheia.
        <SelectPrimitive.Positioner
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          alignItemWithTrigger={alignItemWithTrigger}
          className="contents!"
          style={{ position: 'static', transform: 'none', opacity: 1 }}
        >
          <BottomSheet
            open={isSelectOpen}
            onClose={() => setSelectOpen(false)}
            onExitComplete={() => {
              if (!isSelectOpenRef.current) {
                unmountSelect();
              }
            }}
            backdrop
            backdropClassName="z-40"
            dragOnlyOnHandle
            id="mobile-select-sheet"
            className="fixed inset-x-0 bottom-0 w-full z-50 bg-canvas"
          >
            <SelectPrimitive.Popup
              data-slot="select-content"
              className={cn(
                'relative overflow-x-hidden overflow-y-auto bg-canvas text-black outline-hidden border-t-2 border-ink',
                className,
                // Overrides mobile por último: nenhuma restrição desktop (ex.: max-w-[...])
                // pode encolher a largura do popup dentro do BottomSheet.
                'w-full max-w-none min-w-0 max-h-[min(60dvh,calc(100dvh-8rem))] rounded-none border-x-0 border-b-0'
              )}
              {...props}
            >
              {list}
            </SelectPrimitive.Popup>
          </BottomSheet>
        </SelectPrimitive.Positioner>
      ) : (
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
            {list}
            <SelectScrollDownButton />
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      )}
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
