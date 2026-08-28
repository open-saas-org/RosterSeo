"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClayConversationView } from "./types";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Renders in place of the normal nav groups when the sidebar is in Chat
// mode (see SidebarModeTabs). Refetches whenever the active thread (the `c`
// query param) changes - cheap, and it's the only signal this component has
// that ClayWorkspace (a separate part of the tree, on the page itself) may
// have just created a new conversation or renamed one from its first message.
export function ClaySidebarNav({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");
  const [conversations, setConversations] = useState<ClayConversationView[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/clay/conversations`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setConversations(data.conversations ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, activeId]);

  return (
    <div className="flex flex-col gap-0.5 px-2">
      <Link
        href="/clay"
        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Plus className="size-4" />
        New chat
      </Link>
      {conversations.length === 0 ? (
        <p className="px-2.5 py-2 text-xs text-sidebar-foreground/60">No chats yet - ask Clay something to start one.</p>
      ) : (
        conversations.map((c) => (
          <Link
            key={c.id}
            href={`/clay?c=${c.id}`}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              c.id === activeId && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
            )}
          >
            <span className="line-clamp-1 w-full">{c.title ?? "Untitled chat"}</span>
            <span className="text-xs text-sidebar-foreground/50">{relativeTime(c.lastMessageAt)}</span>
          </Link>
        ))
      )}
    </div>
  );
}
