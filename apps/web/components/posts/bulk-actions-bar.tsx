"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ScheduleAt } from "@/components/posts/schedule-at";

// Sticky bulk-select action bar shared by both pillars' Posts lists - shown
// only while selectedIds is non-empty. Mirrors
// rank-tracking-table.tsx's bulk-select pattern (a plain Set<string> owned
// by the parent list, not a DataTable row-selection feature, since none of
// the list components here use DataTable). Mobile: fixed to the bottom
// (below `md:`, matching ui/sidebar.tsx's breakpoint) so it's reachable
// with a thumb instead of scrolled past; sticky to the top above `md:`.
export function BulkActionsBar({
  count,
  onClear,
  onDelete,
  onReschedule,
}: {
  count: number;
  onClear: () => void;
  onDelete: () => Promise<void>;
  onReschedule: (scheduledFor: string) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");

  if (count === 0) return null;

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await onDelete();
      setConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReschedule() {
    if (!scheduledFor) return;
    setIsRescheduling(true);
    try {
      await onReschedule(new Date(scheduledFor).toISOString());
      setRescheduleOpen(false);
      setScheduledFor("");
    } finally {
      setIsRescheduling(false);
    }
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-popover p-3 shadow-sm max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:top-auto max-md:z-40">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
            <X className="size-4" />
          </Button>
          <span className="text-sm font-medium">{count} selected</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setRescheduleOpen(true)}>
            <CalendarClock className="size-3.5" />
            Reschedule
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {count} post{count === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. Any version already sent to a platform stays there - this only removes it from RosterSEO.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="button" variant="destructive" disabled={isDeleting} onClick={handleDelete} className="gap-1.5">
              {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule {count} post{count === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Only posts still scheduled (not already publishing/published) will move - anything already sent is left alone.</DialogDescription>
          </DialogHeader>
          <div className="px-1">
            <ScheduleAt value={scheduledFor} onChange={setScheduledFor} />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="button" disabled={isRescheduling || !scheduledFor} onClick={handleReschedule} className="gap-1.5">
              {isRescheduling ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
