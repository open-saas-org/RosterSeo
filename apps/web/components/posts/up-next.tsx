import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_DOT, type CalendarEvent } from "./post-calendar";

// Shared cross-pillar "what's coming up" strip - Publish and Social pages
// each fetch their own upcoming posts (still project-scoped, still
// pillar-specific queries) and hand them here as the same CalendarEvent
// shape PostCalendar already uses, so the two views agree on what a post
// looks like without this component knowing about either DB table.
function relativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins <= 0) return "now";
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `in ${diffDays}d`;
}

export function UpNext({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <CalendarClock className="size-3.5" />
        Up next
      </p>
      <div className="flex flex-col gap-1">
        {events.map((event) => (
          <Link key={event.id} href={event.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
            <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[event.status])} />
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(event.date)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
