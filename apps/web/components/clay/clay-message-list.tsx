"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleCheck, CircleX, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClayToolConfirmCard } from "./clay-tool-confirm-card";
import { TOOL_LABELS } from "./tool-labels";
import type { ClayLiveStatus, ClayMessageView, ClayToolCallView } from "./types";

function ToolCallDisclosure({ call }: { call: ClayToolCallView }) {
  const [open, setOpen] = useState(false);

  if (call.name === "update_project_notes") {
    return (
      <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
        <Sparkles className="size-3" />
        Updated project notes
      </div>
    );
  }

  if (call.status === "denied") {
    return (
      <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
        <CircleX className="size-3" />
        {TOOL_LABELS[call.name] ?? call.name} - declined
      </div>
    );
  }
  if (call.status === "error") {
    return (
      <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs text-destructive">
        <CircleX className="size-3" />
        {TOOL_LABELS[call.name] ?? call.name} failed{call.error ? `: ${call.error}` : ""}
      </div>
    );
  }

  // auto_executed | approved - a completed real action/lookup.
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {call.kind === "write" ? <CircleCheck className="size-3 text-success" /> : <Wrench className="size-3" />}
        {TOOL_LABELS[call.name] ?? `Used ${call.name}`}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <pre className="max-h-48 w-full max-w-full overflow-auto rounded-lg bg-muted/50 p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap">
          {JSON.stringify(call.result ?? call.arguments, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function LiveStatusRow({ status }: { status: ClayLiveStatus }) {
  const label = status.state === "thinking" ? "Clay is thinking…" : `Using ${TOOL_LABELS[status.name] ?? status.name}…`;
  return (
    <div className="flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-3.5 animate-pulse" />
      </div>
      <div className="flex items-center gap-1.5 pt-0.5 text-[15px] text-muted-foreground">
        <span>{label}</span>
        <span className="flex gap-0.5">
          <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
          <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
          <span className="size-1 animate-bounce rounded-full bg-current" />
        </span>
      </div>
    </div>
  );
}

export function ClayMessageList({
  messages,
  status,
  onRespondToToolCall,
}: {
  messages: ClayMessageView[];
  status?: ClayLiveStatus | null;
  onRespondToToolCall: (toolCallId: string, approve: boolean) => Promise<void>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-8">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[75%] rounded-3xl bg-muted px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">{m.content}</div>
          </div>
        ) : (
          <div key={m.id} className="flex gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-3.5" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
              {m.content ? <div className="text-[15px] leading-7 whitespace-pre-wrap">{m.content}</div> : null}
              {m.toolCalls && m.toolCalls.length > 0 ? (
                <div className="flex w-full flex-col gap-1.5">
                  {m.toolCalls.map((call) =>
                    call.status === "pending_confirmation" ? (
                      <ClayToolConfirmCard key={call.id} call={call} onRespond={onRespondToToolCall} />
                    ) : (
                      <ToolCallDisclosure key={call.id} call={call} />
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ),
      )}
      {status ? <LiveStatusRow status={status} /> : null}
      <div ref={bottomRef} />
    </div>
  );
}
