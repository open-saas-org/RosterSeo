import { desc, eq } from "drizzle-orm";
import { clayConversations, clayMessages, projects, withUserContext, type ClayToolCall } from "@seo-tool/db";
import { getProvider, type ClayToolDef } from "@seo-tool/ai-visibility";
import { buildClayContext } from "./context";
import { CLAY_TOOLS, executeClayTool, getClayTool, type ClayProject } from "./tools/registry";
import { resolveClayModel, resolveClayProvider } from "./provider";
import { maybeRefreshProjectNotes } from "./project-notes";

// Per-turn cap on read-tool round trips before Clay is forced to stop and
// hand control back to the user - bounds runaway cost/loops. A turn that
// pauses on a write-tool confirmation doesn't count against this (it
// returns to the user immediately either way).
const MAX_AUTO_TOOL_ITERATIONS = 6;
const CHAT_MAX_TOKENS = 1200;

export type ClayMessageRow = typeof clayMessages.$inferSelect;
export type ClayTurnResult = { messages: ClayMessageRow[]; pendingConfirmation: boolean };

// Streamed to the client as the turn progresses, so the UI can show real
// "thinking" / "using tool X" status and append each real message row as
// soon as it's committed - instead of one long blocking request that looks
// frozen on any turn with more than a single LLM round trip.
export type ClayTurnEvent =
  | { type: "status"; state: "thinking" }
  | { type: "status"; state: "tool"; name: string }
  | { type: "message"; message: ClayMessageRow }
  | { type: "done"; pendingConfirmation: boolean };

export type ClayTurnEmit = (event: ClayTurnEvent) => void;

const TOOL_DEFS: ClayToolDef[] = CLAY_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

async function insertMessage(userId: string, projectId: string, conversationId: string, role: "user" | "assistant", content: string | null, toolCalls: ClayToolCall[] | null) {
  const [row] = await withUserContext(userId, (tx) =>
    tx.insert(clayMessages).values({ conversationId, projectId, role, content, toolCalls }).returning(),
  );
  await withUserContext(userId, (tx) => tx.update(clayConversations).set({ lastMessageAt: new Date() }).where(eq(clayConversations.id, conversationId)));
  return row!;
}

// The user's message must already be inserted (by the caller - the
// messages route) before this runs; this just continues the turn from
// whatever's currently in clay_messages for the conversation.
export async function runClayTurn(userId: string, projectId: string, conversationId: string, emit?: ClayTurnEmit): Promise<ClayTurnResult> {
  return continueLoop(userId, projectId, conversationId, 0, emit);
}

// Called after a pending tool call has been approved/denied and its row
// already updated (see the tool-calls response route) - if that resolved
// the last pending call in the batch, this continues the model loop with
// the real result now available; otherwise it just reports back that the
// turn is still waiting on more approvals.
export async function resumeClayTurn(
  userId: string,
  projectId: string,
  conversationId: string,
  toolCallId: string,
  approve: boolean,
  emit?: ClayTurnEmit,
): Promise<ClayTurnResult> {
  const messageRow = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(clayMessages).where(eq(clayMessages.conversationId, conversationId)).orderBy(desc(clayMessages.createdAt)).limit(1);
    return row ?? null;
  });
  if (!messageRow || messageRow.role !== "assistant" || !messageRow.toolCalls) {
    throw new Error("No pending tool call found for this conversation.");
  }

  const calls = messageRow.toolCalls;
  const target = calls.find((c) => c.id === toolCallId);
  if (!target || target.status !== "pending_confirmation") {
    throw new Error("This tool call is no longer pending.");
  }

  const project = await loadClayProject(userId, projectId);

  if (approve) {
    emit?.({ type: "status", state: "tool", name: target.name });
    const execResult = await executeClayTool(target.name, target.arguments, { userId, projectId }, project);
    target.status = execResult.ok ? "approved" : "error";
    target.result = execResult.ok ? execResult.result : undefined;
    target.error = execResult.ok ? undefined : execResult.error;
  } else {
    target.status = "denied";
  }

  const updatedCalls = calls.map((c) => (c.id === toolCallId ? target : c));
  await withUserContext(userId, (tx) => tx.update(clayMessages).set({ toolCalls: updatedCalls }).where(eq(clayMessages.id, messageRow.id)));

  const updatedRow = { ...messageRow, toolCalls: updatedCalls };
  emit?.({ type: "message", message: updatedRow });

  const stillPending = updatedCalls.some((c) => c.status === "pending_confirmation");
  if (stillPending) {
    emit?.({ type: "done", pendingConfirmation: true });
    return { messages: [updatedRow], pendingConfirmation: true };
  }

  return continueLoop(userId, projectId, conversationId, 0, emit);
}

async function loadClayProject(userId: string, projectId: string): Promise<ClayProject> {
  const [project] = await withUserContext(userId, (tx) => tx.select({ id: projects.id, domain: projects.domain, name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1));
  if (!project) throw new Error("Project not found");
  return project;
}

async function continueLoop(userId: string, projectId: string, conversationId: string, iterationsSoFar: number, emit?: ClayTurnEmit): Promise<ClayTurnResult> {
  const ctx = await buildClayContext(userId, projectId, conversationId);
  const providerId = resolveClayProvider(ctx.project.clayProvider);
  const model = resolveClayModel(ctx.project.clayModel, providerId);
  const provider = getProvider(providerId);

  if (!provider?.isConfigured() || !provider.chat) {
    const row = await insertMessage(
      userId,
      projectId,
      conversationId,
      "assistant",
      `I need a real ${providerId} API key configured to work - ask whoever runs this deployment to set one, or switch me to a different provider in settings.`,
      null,
    );
    emit?.({ type: "message", message: row });
    emit?.({ type: "done", pendingConfirmation: false });
    return { messages: [row], pendingConfirmation: false };
  }

  emit?.({ type: "status", state: "thinking" });
  const result = await provider.chat({ model, systemPrompt: ctx.systemPrompt, messages: ctx.messages, tools: TOOL_DEFS, maxTokens: CHAT_MAX_TOKENS });

  if (result.stopReason !== "tool_calls" || result.toolCalls.length === 0) {
    const row = await insertMessage(userId, projectId, conversationId, "assistant", result.content ?? "", null);
    emit?.({ type: "message", message: row });
    void maybeRefreshProjectNotes(userId, projectId).catch((err) => console.error("[clay] project-notes refresh failed", err));
    emit?.({ type: "done", pendingConfirmation: false });
    return { messages: [row], pendingConfirmation: false };
  }

  if (iterationsSoFar >= MAX_AUTO_TOOL_ITERATIONS) {
    const row = await insertMessage(userId, projectId, conversationId, "assistant", "I've hit my step limit for this turn - let me know if you'd like me to keep going.", null);
    emit?.({ type: "message", message: row });
    emit?.({ type: "done", pendingConfirmation: false });
    return { messages: [row], pendingConfirmation: false };
  }

  const project: ClayProject = { id: ctx.project.id, domain: ctx.project.domain, name: ctx.project.name };
  const toolCallEntries: ClayToolCall[] = [];

  for (const call of result.toolCalls) {
    const spec = getClayTool(call.name);
    if (!spec) {
      toolCallEntries.push({ id: call.id, name: call.name, arguments: call.arguments, kind: "read", status: "error", error: `Unknown tool: ${call.name}` });
      continue;
    }
    if (spec.requiresConfirmation) {
      toolCallEntries.push({ id: call.id, name: call.name, arguments: call.arguments, kind: "write", status: "pending_confirmation" });
      continue;
    }
    emit?.({ type: "status", state: "tool", name: call.name });
    const execResult = await executeClayTool(call.name, call.arguments, { userId, projectId }, project);
    toolCallEntries.push({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
      kind: spec.requiresConfirmation ? "write" : "read",
      status: execResult.ok ? "auto_executed" : "error",
      result: execResult.ok ? execResult.result : undefined,
      error: execResult.ok ? undefined : execResult.error,
    });
  }

  const row = await insertMessage(userId, projectId, conversationId, "assistant", result.content, toolCallEntries);
  emit?.({ type: "message", message: row });

  const hasPending = toolCallEntries.some((e) => e.status === "pending_confirmation");
  if (hasPending) {
    emit?.({ type: "done", pendingConfirmation: true });
    return { messages: [row], pendingConfirmation: true };
  }

  return continueLoop(userId, projectId, conversationId, iterationsSoFar + 1, emit);
}
