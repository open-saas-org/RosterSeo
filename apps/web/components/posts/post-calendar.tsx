"use client";

import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import type { DayButtonProps } from "react-day-picker";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Calendar } from "@/components/ui/calendar";
import { useIsMobile } from "@/hooks/use-mobile";
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
  platforms: string[];
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

// Rough per-platform accent colors (left-border accent on a calendar
// entry, additive to the status dot above, not a replacement for it) -
// covers every platform packages/publishing and packages/social support
// (see app-schema.ts's blog_connections/social_connections `platform`
// comments). Not an attempt at pixel-exact brand colors, just enough
// visual distinction to tell platforms apart at a glance in a dense
// calendar. Falls back to a neutral border for anything unlisted.
const PLATFORM_COLOR: Record<string, string> = {
  wordpress: "border-l-blue-700",
  wordpress_com: "border-l-blue-500",
  ghost: "border-l-neutral-700",
  tumblr: "border-l-indigo-800",
  devto: "border-l-neutral-900",
  hashnode: "border-l-sky-600",
  webflow: "border-l-indigo-400",
  shopify: "border-l-green-600",
  hubspot: "border-l-orange-500",
  blogger: "border-l-orange-600",
  bluesky: "border-l-sky-400",
  mastodon: "border-l-purple-500",
  linkedin: "border-l-blue-600",
  pinterest: "border-l-red-600",
  facebook_page: "border-l-blue-500",
  instagram: "border-l-pink-500",
  threads: "border-l-neutral-800",
  tiktok: "border-l-neutral-900",
  x: "border-l-neutral-900",
};
const DEFAULT_PLATFORM_COLOR = "border-l-border";

function platformAccent(platforms: string[]): string {
  return PLATFORM_COLOR[platforms[0] ?? ""] ?? DEFAULT_PLATFORM_COLOR;
}

function dayKey(date: Date): string {
  return date.toDateString();
}

// Keeps the original time-of-day (hours/minutes/seconds), only moving the
// calendar date itself - dragging a 9am post to a new day should still
// fire at 9am, not reset to midnight.
function withNewDay(original: Date, newDay: Date): Date {
  const next = new Date(newDay);
  next.setHours(original.getHours(), original.getMinutes(), original.getSeconds(), original.getMilliseconds());
  return next;
}

function DraggableEventRow({
  event,
  onSelect,
  disabled,
}: {
  event: CalendarEvent;
  onSelect?: (id: string) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: event.id, disabled });
  const content = (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: CSS.Translate.toString(transform), zIndex: 50 } : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-l-2 p-2.5 text-sm",
        platformAccent(event.platforms),
        isDragging ? "opacity-70 shadow-md" : "",
        !disabled && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[event.status])} />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left hover:underline"
        onClick={() => onSelect?.(event.id)}
        // Prevent a plain click from also starting a drag gesture on
        // pointer-down - dnd-kit still gets its listeners via the wrapping
        // div above for the actual drag, this is just the click target.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {event.title}
      </button>
      <span className="shrink-0 text-xs capitalize text-muted-foreground">{event.status}</span>
    </div>
  );
  return content;
}

function DroppableDayButton({
  day,
  className,
  dayEvents,
  ...dayButtonProps
}: {
  day: DayButtonProps["day"];
  className?: string;
  dayEvents: CalendarEvent[];
} & Omit<ComponentPropsWithoutRef<"button">, "className">) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day.date), data: { date: day.date } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn(className, "flex flex-col items-center justify-center gap-0.5", isOver && "bg-primary/10 ring-1 ring-primary/40")}
      {...dayButtonProps}
    >
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
}

export function PostCalendar({
  events,
  className,
  pillar,
  projectId,
  onSelectPost,
  onRescheduled,
}: {
  events: CalendarEvent[];
  className?: string;
  // Which pillar's PATCH reschedule route to call on drag-and-drop - this
  // component is always rendered per-pillar (Publish's and Social's own
  // Posts pages each build their own `events` array), never a merged
  // cross-pillar view, so one pillar per instance is enough.
  pillar: "blog" | "social";
  projectId: string;
  // Opens the shared PostsInspector sheet instead of a full page
  // navigation. Both real call sites (Publish/Social Posts lists) always
  // pass this; a click is a no-op if omitted (no href fallback - `href`
  // stays on CalendarEvent only because up-next.tsx still links with it).
  onSelectPost?: (id: string) => void;
  // Called once a drag-and-drop reschedule actually succeeds server-side
  // (typically `router.refresh()`), so the parent's real data replaces
  // this component's optimistic local state.
  onRescheduled?: () => void;
}) {
  const [month, setMonth] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | undefined>();
  const [localEvents, setLocalEvents] = useState(events);
  const [dragError, setDragError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Reconcile with the parent's real data whenever it changes (e.g. after
  // onRescheduled triggers a router.refresh()) - this component's local
  // state only exists for the brief optimistic window between a drop and
  // the server confirming it.
  useEffect(() => setLocalEvents(events), [events]);

  useEffect(() => {
    if (!dragError) return;
    const timeout = setTimeout(() => setDragError(null), 4000);
    return () => clearTimeout(timeout);
  }, [dragError]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of localEvents) {
      const key = dayKey(event.date);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [localEvents]);

  const selectedEvents = selectedDay ? (eventsByDay.get(dayKey(selectedDay)) ?? []) : [];

  async function handleDragEnd(e: DragEndEvent) {
    const droppedDate = e.over?.data.current?.date as Date | undefined;
    if (!droppedDate) return;

    const eventId = e.active.id as string;
    const event = localEvents.find((ev) => ev.id === eventId);
    if (!event) return;
    if (dayKey(event.date) === dayKey(droppedDate)) return; // dropped on its own day - no-op

    const newDate = withNewDay(event.date, droppedDate);
    const previousDate = event.date;

    // Optimistic move first, reverted below on failure.
    setLocalEvents((prev) => prev.map((ev) => (ev.id === eventId ? { ...ev, date: newDate } : ev)));

    try {
      const res = await fetch(`/api/projects/${projectId}/${pillar}/posts/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: newDate.toISOString() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn't reschedule that post.");
      }
      onRescheduled?.();
    } catch (err) {
      setLocalEvents((prev) => prev.map((ev) => (ev.id === eventId ? { ...ev, date: previousDate } : ev)));
      setDragError(err instanceof Error ? err.message : "Couldn't reschedule that post.");
    }
  }

  const calendar = (
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
          if (isMobile) {
            // No drag-and-drop on touch for v1 (real scope creep per the
            // PRD's phasing) - plain non-droppable cell, same as before.
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
          }
          return <DroppableDayButton day={day} className={dayButtonClassName} dayEvents={dayEvents} {...dayButtonProps} />;
        },
      }}
    />
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {dragError ? <p className="text-xs text-destructive">{dragError}</p> : null}
      <div className="flex flex-col gap-4 sm:flex-row">
        {isMobile ? calendar : <DndContext onDragEnd={handleDragEnd}>{calendar}</DndContext>}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {selectedDay
              ? selectedDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
              : "Select a day to see what's on it"}
          </p>
          {selectedDay && selectedEvents.length === 0 ? <p className="text-sm text-muted-foreground">Nothing on this day.</p> : null}
          <div className="flex flex-col gap-1.5">
            {selectedEvents.map((event) =>
              isMobile ? (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => (onSelectPost ? onSelectPost(event.id) : undefined)}
                  className={cn("flex items-center gap-2 rounded-lg border border-l-2 p-2.5 text-left text-sm hover:bg-muted/50", platformAccent(event.platforms))}
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[event.status])} />
                  <span className="min-w-0 flex-1 truncate">{event.title}</span>
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">{event.status}</span>
                </button>
              ) : (
                <DraggableEventRow key={event.id} event={event} onSelect={onSelectPost} disabled={event.status !== "scheduled"} />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
