"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TOOL_LABELS } from "./tool-labels";
import type { ClayToolCallView } from "./types";

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
}

export function ClayToolConfirmCard({
  call,
  onRespond,
}: {
  call: ClayToolCallView;
  onRespond: (toolCallId: string, approve: boolean) => Promise<void>;
}) {
  const [isResponding, setIsResponding] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(approve: boolean) {
    setError(null);
    setIsResponding(approve ? "approve" : "deny");
    try {
      await onRespond(call.id, approve);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that.");
    } finally {
      setIsResponding(null);
    }
  }

  if (call.status !== "pending_confirmation") {
    // Already resolved (approved/denied/error) elsewhere in the transcript
    // - shown as a small inline note, not a card, by clay-message-list.tsx.
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{TOOL_LABELS[call.name] ?? call.name}</p>
          {formatArgs(call.arguments) ? <p className="mt-0.5 text-xs text-muted-foreground">{formatArgs(call.arguments)}</p> : null}
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="xs" disabled={!!isResponding} onClick={() => respond(true)} className="gap-1.5">
          {isResponding === "approve" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          Approve
        </Button>
        <Button size="xs" variant="outline" disabled={!!isResponding} onClick={() => respond(false)} className="gap-1.5">
          {isResponding === "deny" ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
          Deny
        </Button>
      </div>
    </div>
  );
}
