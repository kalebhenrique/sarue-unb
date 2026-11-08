import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker"
import { ptBR } from "date-fns/locale"

import * as React from "react"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  locale = ptBR,
  formatters,
  components,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      className={cn(
        "group/calendar rounded-xl border-2 border-ink bg-paper p-3 text-black",
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("pt-BR", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-2 sm:flex-row",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-3", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          "cursor-pointer inline-flex size-7 items-center justify-center rounded-lg border-2 border-ink bg-canvas p-0 text-black hover:bg-neutral-200 dark:hover:bg-neutral-300 select-none aria-disabled:opacity-50 transition-colors",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          "cursor-pointer inline-flex size-7 items-center justify-center rounded-lg border-2 border-ink bg-canvas p-0 text-black hover:bg-neutral-200 dark:hover:bg-neutral-300 select-none aria-disabled:opacity-50 transition-colors",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-7 w-full items-center justify-center px-8",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "flex h-7 w-full items-center justify-center gap-1.5 text-sm font-black",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "relative rounded-lg border-2 border-ink bg-canvas",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn("absolute inset-0 opacity-0", defaultClassNames.dropdown),
        caption_label: cn(
          "font-black capitalize select-none text-black",
          captionLayout === "label"
            ? "text-sm"
            : "flex h-7 items-center gap-1 rounded-lg px-2 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "w-9 rounded-lg text-[11px] font-black uppercase text-neutral-600 select-none",
          defaultClassNames.weekday,
        ),
        week: cn("mt-1.5 flex w-full gap-0.5", defaultClassNames.week),
        week_number_header: cn(
          "w-9 select-none",
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          "text-xs font-bold text-neutral-600 select-none",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day relative size-9 p-0 text-center text-xs select-none",
          defaultClassNames.day,
        ),
        range_start: cn(
          "rounded-l-lg bg-pastel-blue",
          defaultClassNames.range_start,
        ),
        range_middle: cn("bg-pastel-blue", defaultClassNames.range_middle),
        range_end: cn("rounded-r-lg bg-pastel-blue", defaultClassNames.range_end),
        selected: cn(
          props.mode !== "range" && "rounded-lg",
          defaultClassNames.selected,
        ),
        today: cn(defaultClassNames.today),
        outside: cn("opacity-45", defaultClassNames.outside),
        disabled: cn("opacity-35 pointer-events-none", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeft className={cn("size-4 stroke-[2.5]", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRight className={cn("size-4 stroke-[2.5]", className)} {...props} />
            )
          }

          return <ChevronDown className={cn("size-4 stroke-[2.5]", className)} {...props} />
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-9 items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const selectedSingle =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle

  const isSelectedEndpoint =
    selectedSingle || modifiers.range_start || modifiers.range_end

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString("pt-BR")}
      data-selected-single={selectedSingle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-today={modifiers.today}
      className={cn(
        "cursor-pointer inline-flex size-9 items-center justify-center rounded-lg border-2 border-transparent p-0 text-xs font-bold text-black hover:bg-neutral-100 dark:hover:bg-neutral-200 hover:border-ink/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue transition-colors",
        modifiers.today && !isSelectedEndpoint && "border-ink bg-neo-yellow font-black text-ink hover:bg-neo-yellowHover",
        modifiers.range_middle && "bg-pastel-blue text-black",
        isSelectedEndpoint &&
          "border-ink bg-neo-blue font-black text-white hover:bg-neo-blueHover hover:border-ink",
        defaultClassNames.day_button,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
