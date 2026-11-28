import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"

import * as React from "react"

import { Button } from "./button"

import { cn } from "@/lib/utils"

const toast = ToastPrimitive.createToastManager()

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? !window.matchMedia("(min-width: 48rem)").matches
      : false,
  )

  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }
    const mediaQuery = window.matchMedia("(min-width: 48rem)")
    const update = () => setIsMobile(!mediaQuery.matches)
    update()
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return isMobile
}

function isAndroidDevice() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)
}

// No mobile (< md), os toasts ficam próximos ao topo para não competir com a tab bar
// inferior (no Android a MainActivity já aplica padding da status bar); no desktop (md+),
// empilham no canto inferior direito acima do adesivo de feedback (40px + 12px sobre 16px).
function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  const isAndroid = React.useMemo(() => isAndroidDevice(), [])

  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "pointer-events-none fixed inset-x-3 z-50 mx-auto w-auto max-w-sm outline-hidden md:top-auto md:right-4 md:bottom-[68px] md:left-auto md:mx-0 md:w-full",
        isAndroid ? "top-2" : "top-[calc(0.5rem+env(safe-area-inset-top))]",
        className,
      )}
      {...props}
    />
  )
}

function Toast({
  className,
  swipeDirection,
  ...props
}: ToastPrimitive.Root.Props) {
  const isMobile = useIsMobileViewport()
  const resolvedSwipeDirection =
    swipeDirection ?? (isMobile ? ["up", "right"] : ["down", "right"])

  return (
    <ToastPrimitive.Root
      data-slot="toast"
      swipeDirection={resolvedSwipeDirection}
      className={cn(
        "group/toast pointer-events-auto absolute top-0 right-0 z-[calc(1000-var(--toast-index))] w-full origin-top overflow-hidden rounded-lg border-2 border-ink bg-canvas text-black will-change-transform outline-hidden select-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 md:top-auto md:bottom-0 md:origin-bottom",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] md:[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms] md:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
        "after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] md:after:top-full md:after:bottom-auto",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(-150%)] md:data-starting-style:[transform:translateY(150%)]",
        // A saída desliza cruzando a borda de origem (topo no mobile; no desktop
        // desce sobre a faixa do adesivo de feedback): o fade junto do slide
        // evita o tranco visual antes de sumir.
        "data-ending-style:opacity-0",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)] md:[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className,
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "flex h-full items-center gap-2.5 overflow-hidden px-3 pt-2.5 pb-3 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100 md:gap-3 md:px-4 md:pt-3 md:pb-3.5",
        className,
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-xs font-extrabold tracking-tight md:text-sm", className)}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-xs font-semibold text-neutral-800 md:text-sm break-words [overflow-wrap:anywhere]", className)}
      {...props}
    />
  )
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("shrink-0", className)}
      {...props}
    />
  )
}

function ToastIcon({ type }: { type: string | undefined }) {
  let icon: React.ReactNode = null

  if (type === "success") {
    icon = <CircleCheckIcon aria-hidden="true" />
  }

  if (type === "info") {
    icon = <InfoIcon aria-hidden="true" />
  }

  if (type === "warning") {
    icon = <TriangleAlertIcon aria-hidden="true" />
  }

  if (type === "error" || type === "danger") {
    icon = <OctagonXIcon className="text-black" aria-hidden="true" />
  }

  if (type === "loading") {
    icon = <Loader2Icon className="animate-spin" aria-hidden="true" />
  }

  if (!icon) {
    return null
  }

  return (
    <span
      data-slot="toast-icon"
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  )
}

const TOAST_PROGRESS_COLORS: Record<string, string> = {
  success: "bg-neo-green",
  warning: "bg-neo-yellow",
  error: "bg-neo-danger",
  danger: "bg-neo-danger",
  info: "bg-neo-blue",
}

function ToastProgressBar({
  type,
  duration,
}: {
  type: string | undefined
  duration: number
}) {
  const barColor = (type && TOAST_PROGRESS_COLORS[type]) || "bg-neo-blue"

  return (
    <div
      aria-hidden="true"
      data-slot="toast-progress"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/10 dark:bg-white/10"
    >
      <div
        className={cn(
          "h-full w-full origin-left group-data-expanded/toast:[animation-play-state:paused]",
          barColor,
        )}
        style={{
          animation: `sarue-toast-progress ${duration}ms linear forwards`,
        }}
      />
    </div>
  )
}

function ToastList() {
  const { toasts, close } = ToastPrimitive.useToastManager()

  return toasts.map((toastItem) => {
    const duration =
      typeof toastItem.timeout === "number" ? toastItem.timeout : 5000
    const showProgress = duration > 0 && toastItem.type !== "loading"

    return (
      <Toast
        key={toastItem.id}
        toast={toastItem}
        onClick={() => close(toastItem.id)}
      >
        <ToastContent>
          <ToastIcon type={toastItem.type} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-1">
            <ToastTitle />
            <ToastDescription />
          </div>
          <ToastAction />
        </ToastContent>
        {showProgress ? (
          <ToastProgressBar type={toastItem.type} duration={duration} />
        ) : null}
      </Toast>
    )
  })
}

function Toaster({
  children,
  toastManager = toast,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

export {
  Toaster,
  Toast,
  ToastAction,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  toast,
  useToastManager,
}
