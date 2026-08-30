"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings, Sparkles } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { CappyMessageList } from "./cappy-message-list";
import { CappyComposer } from "./cappy-composer";
import { CappySettingsDialog, type CappySettings } from "./cappy-settings-dialog";
import type { CappyLiveStatus, CappyMessageView, CappyStreamEvent } from "./types";

const STARTER_PROMPTS = [
  "What keywords should I focus on next?",
  "Who are my top competitors?",
  "How is my Search Console traffic trending?",
  "Find quick-win keywords I already rank for",
];

// Reads the NDJSON body streamed by the messages / tool-calls routes (see
// lib/cappy/stream-response.ts) and hands each parsed event to onEvent as
// soon as its line arrives - the caller applies "thinking" / "using tool"
// status and appends/updates messages live instead of waiting for the
// whole (possibly multi-step) turn to finish.
async function streamTurn(url: string, body: unknown, onEvent: (event: CappyStreamEvent) => void) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Cappy couldn't respond. Try again.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (; ;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) onEvent(JSON.parse(line) as CappyStreamEvent);
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as CappyStreamEvent);
}

function upsertMessage(messages: CappyMessageView[], incoming: CappyMessageView): CappyMessageView[] {
  const idx = messages.findIndex((m) => m.id === incoming.id);
  if (idx === -1) return [...messages, incoming];
  const next = [...messages];
  next[idx] = incoming;
  return next;
}

export function CappyWorkspace({ projectId, domain }: { projectId: string; domain: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("c");

  const [messages, setMessages] = useState<CappyMessageView[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [liveStatus, setLiveStatus] = useState<CappyLiveStatus | null>(null);
  const [settings, setSettings] = useState<CappySettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadConversation = useCallback(
    async (id: string) => {
      setIsLoadingThread(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/cappy/conversations/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages ?? []);
      } finally {
        setIsLoadingThread(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId, loadConversation]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/cappy/settings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setSettings(data));
  }, [projectId]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const res = await fetch(`/api/projects/${projectId}/cappy/conversations`, { method: "POST" });
    const data = await res.json();
    router.replace(`/cappy?c=${data.conversation.id}`, { scroll: false });
    return data.conversation.id as string;
  }

  async function handleSend(content: string) {
    const id = await ensureConversation();
    const optimisticUserMessage: CappyMessageView = {
      id: `optimistic-${Date.now()}`,
      conversationId: id,
      role: "user",
      content,
      toolCalls: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMessage]);
    setIsSending(true);
    setLiveStatus({ state: "thinking" });
    try {
      await streamTurn(`/api/projects/${projectId}/cappy/conversations/${id}/messages`, { content }, (event) => {
        if (event.type === "status") setLiveStatus(event);
        else if (event.type === "message") setMessages((prev) => upsertMessage(prev, event.message));
        else if (event.type === "error") throw new Error(event.error);
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMessage.id));
    } finally {
      setIsSending(false);
      setLiveStatus(null);
    }
  }

  async function handleRespondToToolCall(toolCallId: string, approve: boolean) {
    if (!conversationId) return;
    setIsSending(true);
    if (approve) setLiveStatus({ state: "thinking" });
    try {
      await streamTurn(
        `/api/projects/${projectId}/cappy/conversations/${conversationId}/tool-calls/${toolCallId}`,
        { approve },
        (event) => {
          if (event.type === "status") setLiveStatus(event);
          else if (event.type === "message") setMessages((prev) => upsertMessage(prev, event.message));
          else if (event.type === "error") throw new Error(event.error);
        },
      );
    } finally {
      setIsSending(false);
      setLiveStatus(null);
    }
  }

  const isEmpty = messages.length === 0 && !isLoadingThread;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-end px-4 py-2.5 text-xs text-muted-foreground">
        {settings ? (
          <span className="mr-auto">
            {settings.provider}
            {settings.model ? ` · ${settings.model}` : ""}
          </span>
        ) : (
          <span className="mr-auto" />
        )}
        <IconButton icon={Settings} label="Cappy settings" onClick={() => setSettingsOpen(true)} />
      </div>

      {isEmpty ? (
        <>
          <div className="flex flex-1 flex-col overflow-y-auto px-4 pt-10 pb-6 sm:pt-16">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div className="pt-1 text-[15px] leading-7">
                  <p>
                    Hey, I&apos;m Cappy — your in-app SEO agent for {domain}. I can research keywords, size up
                    competitors, read your rankings, backlinks, audits, and Search Console, and turn it into next
                    steps for this project.
                  </p>
                  <p className="mt-3 text-muted-foreground">Ask me anything, or start with one of these:</p>
                </div>
              </div>
              <div className="ml-12 flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="rounded-full border border-border/60 px-3.5 py-2 text-sm text-foreground/90 hover:bg-muted"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="px-4 pb-6">
            <div className="mx-auto w-full max-w-4xl">
              <CappyComposer disabled={isSending} onSend={handleSend} />
            </div>
          </div>
        </>
      ) : (
        <>
          {isLoadingThread ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <CappyMessageList messages={messages} status={liveStatus} onRespondToToolCall={handleRespondToToolCall} />
          )}
          <div className="px-4 pb-6 pt-2">
            <div className="mx-auto w-full max-w-4xl">
              <CappyComposer disabled={isSending} onSend={handleSend} />
            </div>
          </div>
        </>
      )}

      <CappySettingsDialog
        projectId={projectId}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}
