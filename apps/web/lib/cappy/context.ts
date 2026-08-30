import { desc, eq } from "drizzle-orm";
import { cappyMessages, cappyProjectNotes, projects, withUserContext, type CappyToolCall } from "@rosterseo/db";
import type { AgenticMessage } from "@rosterseo/ai-visibility";
import { CAPPY_TOOLS } from "./tools/registry";

const MESSAGE_HISTORY_LIMIT = 40;

const SYSTEM_PROMPT_BASE = `You are Cappy, the built-in AI SEO assistant for this app. You help with SEO strategy and can look up and act on this project's own real data - rankings, site audits, competitors, AI visibility, keyword research, backlinks, local SEO, and backlink outreach - using the tools available to you.

Rules:
- Only state facts you got from a real tool call or the conversation itself. Never invent numbers, rankings, or data you haven't actually looked up.
- Prefer calling a tool over guessing when the user's question is about their real project data.
- Any tool that changes something (adds a keyword, starts an audit, etc.) requires the user's explicit approval before it runs - you'll be told the outcome once they respond, don't assume it happened.
- Keep answers concise and specific to this project, not generic SEO advice.
- If you learn something worth remembering for future conversations about this project (a preference, a constraint, an ongoing goal), call update_project_notes with the full updated summary.`;

export type CappyContext = {
  systemPrompt: string;
  messages: AgenticMessage[];
  project: { id: string; domain: string; name: string; targetLocation: string | null; cappyProvider: string | null; cappyModel: string | null };
};

// Real per-turn conversation reconstruction from cappy_messages - no
// separate "memory" beyond this history + cappy_project_notes (see this
// feature's own plan: plain Postgres, no vector search). Called at the
// start of every turn (runCappyTurn) and every resume (resumeCappyTurn) -
// by the time resumeCappyTurn runs, the just-resolved tool call's row has
// already been updated to approved/denied/error with a real result, so
// this same reconstruction naturally picks it up as a completed exchange.
export async function buildCappyContext(userId: string, projectId: string, conversationId: string): Promise<CappyContext> {
  const [project, notes, rows] = await withUserContext(userId, async (tx) => {
    const [projectRow] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const [notesRow] = await tx.select().from(cappyProjectNotes).where(eq(cappyProjectNotes.projectId, projectId)).limit(1);
    const messageRows = await tx
      .select()
      .from(cappyMessages)
      .where(eq(cappyMessages.conversationId, conversationId))
      .orderBy(desc(cappyMessages.createdAt))
      .limit(MESSAGE_HISTORY_LIMIT);
    return [projectRow, notesRow, messageRows.reverse()] as const;
  });

  if (!project) throw new Error("Project not found");

  const systemPrompt = [
    SYSTEM_PROMPT_BASE,
    `\nCurrent project: ${project.name} (${project.domain})${project.targetLocation ? `, targeting ${project.targetLocation}` : ""}.`,
    notes?.summary ? `\nWhat you already know about this project:\n${notes.summary}` : "",
  ].join("");

  return {
    systemPrompt,
    messages: rows.flatMap(toAgenticMessages),
    project: {
      id: project.id,
      domain: project.domain,
      name: project.name,
      targetLocation: project.targetLocation,
      cappyProvider: project.cappyProvider,
      cappyModel: project.cappyModel,
    },
  };
}

function toAgenticMessages(row: typeof cappyMessages.$inferSelect): AgenticMessage[] {
  if (row.role === "user") {
    return row.content ? [{ role: "user", content: row.content }] : [];
  }

  const calls: CappyToolCall[] = row.toolCalls ?? [];
  const resolvedCalls = calls.filter((c) => c.status !== "pending_confirmation");
  const out: AgenticMessage[] = [
    {
      role: "assistant",
      content: row.content,
      toolCalls: resolvedCalls.length > 0 ? resolvedCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })) : undefined,
    },
  ];
  for (const call of resolvedCalls) {
    const content =
      call.status === "denied"
        ? "The user denied this action - it did not run."
        : call.status === "error"
          ? `Error: ${call.error ?? "unknown error"}`
          : JSON.stringify(call.result ?? null);
    out.push({ role: "tool", toolCallId: call.id, name: call.name, content });
  }
  return out;
}

export { CAPPY_TOOLS };
