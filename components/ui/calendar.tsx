"use client"

import * as React from "react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import "react-day-picker/dist/style.css"
import { ptBR } from "date-fns/locale"

/**
 * Calendar component using react-day-picker v9, styled with Tailwind and a light bluish theme.
 *
 * To customize day rendering, pass a custom Day component via the `components` prop:
 *
 * <Calendar
 *   components={{
 *     Day: (props) => <div>...</div>
 *   }}
 *   ...otherProps
 * />
 */
export function Calendar(props: DayPickerProps) {
  return (
    <DayPicker
      locale={ptBR}
      className={
        "bg-blue-50 dark:bg-info/10 rounded-lg p-4 shadow-md [&_.rdp-caption]:text-blue-700 dark:[&_.rdp-caption]:text-info [&_.rdp-day_selected]:bg-blue-600 [&_.rdp-day_selected]:text-white " +
        (props.className ?? "")
      }
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "text-blue-700 dark:text-info font-semibold flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative",
        day: "h-9 w-9 p-0 font-normal rounded-full aria-selected:opacity-100",
        day_selected: // dark-mode:ok (blue-600+branco ≥AA nos dois temas)
          "bg-blue-600 text-white hover:bg-blue-700 focus:bg-blue-700",
        day_today: "border border-blue-400 dark:border-info", // dark-mode:ok
        day_outside: "text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
        ...props.classNames,
      }}
      styles={{
        ...props.styles,
      }}
      {...props}
    />
  )
}
