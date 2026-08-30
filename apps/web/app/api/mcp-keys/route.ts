import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { mcpApiKeys, withUserContext } from "@rosterseo/db";
import { auth } from "@/lib/auth";
import { generateMcpApiKey } from "@/lib/mcp-keys";

// Static route (no [id] segment) - talks to auth directly, same reasoning
// as apps/web/app/api/projects/route.ts.
async function requireSession(req: NextRequest) {
  return auth.api.getSession({ headers: req.headers });
}

// GET /api/mcp-keys - list the caller's own MCP API keys (never the raw
// key or its hash, only what's needed to identify one in the UI). This
// table has no RLS (see the migration's comment - the MCP server has to
// look up a key's owner before any user context exists), so ownership is
// enforced explicitly here in application code instead.
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await withUserContext(session.user.id, (tx) =>
    tx
      .select({
        id: mcpApiKeys.id,
        name: mcpApiKeys.name,
        keyPrefix: mcpApiKeys.keyPrefix,
        createdAt: mcpApiKeys.createdAt,
        lastUsedAt: mcpApiKeys.lastUsedAt,
        revokedAt: mcpApiKeys.revokedAt,
      })
      .from(mcpApiKeys)
      .where(and(eq(mcpApiKeys.userId, session.user.id), isNull(mcpApiKeys.revokedAt))),
  );

  return NextResponse.json({ keys: rows });
}

// POST /api/mcp-keys - body: { name?: string }. Returns the raw key exactly
// once - only the hash is ever persisted, so this is the caller's only
// chance to see it (same "shown once" convention as every other secret in
// this app - WordPress application passwords, etc.).
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : "Default";

  const { key, hash, prefix } = generateMcpApiKey();

  const [created] = await withUserContext(session.user.id, (tx) =>
    tx
      .insert(mcpApiKeys)
      .values({ userId: session.user.id, name, keyHash: hash, keyPrefix: prefix })
      .returning({ id: mcpApiKeys.id, name: mcpApiKeys.name, keyPrefix: mcpApiKeys.keyPrefix, createdAt: mcpApiKeys.createdAt }),
  );

  return NextResponse.json({ key, ...created }, { status: 201 });
}
