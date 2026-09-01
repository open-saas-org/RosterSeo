"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayButtonProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col gap-3",
        month: "flex flex-col gap-3",
        month_caption: "flex items-center justify-center pt-1 pb-1 relative",
        caption_label: "text-sm font-medium",
        nav: "flex items-center justify-between absolute inset-x-1 top-1",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "size-7 bg-transparent p-0",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "size-7 bg-transparent p-0",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-xs font-normal text-muted-foreground",
        week: "flex w-full mt-1.5",
        day: "size-9 p-0 text-center text-sm",
        day_button: cn(
          "size-9 rounded-md p-0 font-normal text-foreground hover:bg-muted",
          "aria-selected:opacity-100",
        ),
        today: "[&>button]:bg-muted [&>button]:font-semibold",
        selected:
          "[&>button]:bg-primary [&>button]:text-white [&>button]:hover:bg-primary/90 dark:[&>button]:text-black",
        outside: "[&>button]:text-muted-foreground/50",
        disabled: "[&>button]:text-muted-foreground/30 [&>button]:pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...chevronProps} />
          ) : (
            <ChevronRight className="size-4" {...chevronProps} />
          ),
        DayButton: ({ day, modifiers, className: dayButtonClassName, ...dayButtonProps }: DayButtonProps) => (
          <Button
            variant="ghost"
            size="icon-sm"
            data-day={day.date.toLocaleDateString()}
            data-selected={modifiers.selected}
            data-today={modifiers.today}
            className={cn("size-9 rounded-md font-normal", dayButtonClassName)}
            {...dayButtonProps}
          />
        ),
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar }
