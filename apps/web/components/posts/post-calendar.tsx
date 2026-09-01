"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DayButtonProps } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Shared by both pillars - Publish (BlogPostView) and Social (SocialPostView)
// use the same status vocabulary and both have a `scheduledFor`/date, so
// each page maps its own post list into this one shape rather than the
// calendar knowing about either type.
export type CalendarEvent = {
  id: string;
  href: string;
  title: string;
  date: Date;
  status: "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";
};

// Exported so up-next.tsx (and anywhere else that renders one of these
// events as a compact row instead of a calendar cell) uses the exact same
// status->color mapping instead of a second copy that could drift.
export const STATUS_DOT: Record<CalendarEvent["status"], string> = {
  draft: "bg-muted-foreground/40",
  scheduled: "bg-warning",
  publishing: "bg-warning",
  published: "bg-success",
  partial: "bg-destructive",
  failed: "bg-destructive",
};

function dayKey(date: Date): string {
  return date.toDateString();
}

export function PostCalendar({ events, className }: { events: CalendarEvent[]; className?: string }) {
  const [month, setMonth] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | undefined>();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dayKey(event.date);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [events]);

  const selectedEvents = selectedDay ? (eventsByDay.get(dayKey(selectedDay)) ?? []) : [];

  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row", className)}>
      <Calendar
        mode="single"
        month={month}
        onMonthChange={setMonth}
        selected={selectedDay}
        onSelect={setSelectedDay}
        className="w-fit rounded-lg border"
        components={{
          DayButton: ({ day, modifiers: _modifiers, className: dayButtonClassName, ...dayButtonProps }: DayButtonProps) => {
            const dayEvents = eventsByDay.get(dayKey(day.date)) ?? [];
            return (
              <button type="button" className={cn(dayButtonClassName, "flex flex-col items-center justify-center gap-0.5")} {...dayButtonProps}>
                <span>{day.date.getDate()}</span>
                {dayEvents.length > 0 ? (
                  <span className="flex items-center gap-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span key={event.id} className={cn("size-1 rounded-full", STATUS_DOT[event.status])} />
                    ))}
                  </span>
                ) : (
                  <span className="h-1" />
                )}
              </button>
            );
          },
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {selectedDay
            ? selectedDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
            : "Select a day to see what's on it"}
        </p>
        {selectedDay && selectedEvents.length === 0 ? <p className="text-sm text-muted-foreground">Nothing on this day.</p> : null}
        <div className="flex flex-col gap-1.5">
          {selectedEvents.map((event) => (
            <Link key={event.id} href={event.href} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/50">
              <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[event.status])} />
              <span className="min-w-0 flex-1 truncate">{event.title}</span>
              <span className="shrink-0 text-xs capitalize text-muted-foreground">{event.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
