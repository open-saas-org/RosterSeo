"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Produces the same "YYYY-MM-DDTHH:mm" local-datetime string the bare
// `<input type="datetime-local">` it replaces already produced - callers
// (publish-post-review.tsx, social-post-review.tsx) keep parsing it with
// `new Date(scheduledFor)` unchanged, only how it's picked changes.
export function ScheduleAt({ value, onChange }: { value: string; onChange: (localDateTime: string) => void }) {
  const [open, setOpen] = useState(false);
  const [datePart, timePart] = value ? value.split("T") : [undefined, undefined];
  const time = timePart ?? "09:00";
  const selectedDate = datePart ? new Date(`${datePart}T00:00:00`) : undefined;

  function commit(nextDate: Date | undefined, nextTime: string) {
    if (!nextDate) {
      onChange("");
      return;
    }
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, "0");
    const d = String(nextDate.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}T${nextTime}`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" className="gap-1.5" />}>
        <CalendarClock className="size-4" />
        {selectedDate ? `${selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${time}` : "Pick a date & time"}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={selectedDate} onSelect={(d) => commit(d, time)} disabled={{ before: today }} />
        <div className="flex items-center gap-2 border-t p-2.5">
          <Input type="time" value={time} onChange={(e) => commit(selectedDate ?? today, e.target.value)} className="h-8" />
        </div>
      </PopoverContent>
    </Popover>
  );
}
