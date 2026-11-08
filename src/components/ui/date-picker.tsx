import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { Calendar as CalendarIcon } from "lucide-react"
import { Calendar } from "./calendar"
import { cn } from "@/lib/utils"

export interface DatePickerProps {
  id?: string
  /** Valor em formato ISO "YYYY-MM-DD" */
  value: string
  onChange: (isoDate: string) => void
  /** Data mínima permitida em formato ISO "YYYY-MM-DD" */
  min?: string
  disabled?: boolean
  placeholder?: string
  className?: string
}

function parseIsoDate(iso: string): Date | undefined {
  if (!iso) return undefined
  const parts = iso.split("-").map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined
  const [y, m, d] = parts
  return new Date(y, m - 1, d)
}

function formatToIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function formatDisplayDate(iso: string): string {
  const parsed = parseIsoDate(iso)
  if (!parsed) return ""
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export const DatePicker: React.FC<DatePickerProps> = ({
  id,
  value,
  onChange,
  min,
  disabled = false,
  placeholder = "Selecionar data",
  className,
}) => {
  const [open, setOpen] = React.useState(false)
  const selectedDate = React.useMemo(() => parseIsoDate(value), [value])
  const minDate = React.useMemo(() => (min ? parseIsoDate(min) : undefined), [min])

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          "cursor-pointer flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border-2 border-ink bg-paper px-3 py-2 text-xs font-bold text-black focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[box-shadow,border-color] disabled:cursor-not-allowed disabled:opacity-75 select-none",
          !value && "text-neutral-500",
          className,
        )}
      >
        <span className="truncate">{value ? formatDisplayDate(value) : placeholder}</span>
        <CalendarIcon className="w-4 h-4 stroke-[2.5] text-neutral-600 shrink-0" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup className="z-50 outline-hidden origin-(--transform-origin) transition-[opacity,transform] duration-150 ease-out data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate || minDate}
              disabled={minDate ? { before: minDate } : undefined}
              onSelect={(date) => {
                if (date) {
                  onChange(formatToIsoDate(date))
                  setOpen(false)
                }
              }}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
