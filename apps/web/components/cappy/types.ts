export type CappyToolCallView = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  kind: "read" | "write";
  status: "auto_executed" | "pending_confirmation" | "approved" | "denied" | "error";
  result?: unknown;
  error?: string;
};

export type CappyMessageView = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string | null;
  toolCalls: CappyToolCallView[] | null;
  createdAt: string;
};

export type CappyConversationView = {
  id: string;
  projectId: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
};

// Client-side shape of the NDJSON lines streamed by /messages and
// /tool-calls/[toolCallId] (see lib/cappy/stream-response.ts) - one JSON
// object per line, parsed as this after the server<->client JSON boundary
// (Date fields arrive already as ISO strings).
export type CappyLiveStatus = { state: "thinking" } | { state: "tool"; name: string };

export type CappyStreamEvent =
  | { type: "status"; state: "thinking" }
  | { type: "status"; state: "tool"; name: string }
  | { type: "message"; message: CappyMessageView }
  | { type: "done"; pendingConfirmation: boolean }
  | { type: "error"; error: string };
