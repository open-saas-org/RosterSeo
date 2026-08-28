import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { mcpApiKeys, withUserContext } from "@seo-tool/db";
import { auth } from "@/lib/auth";

type RouteParams = { keyId: string };

// DELETE /api/mcp-keys/:keyId - revokes (soft-delete via revokedAt, not a
// hard delete) so the row's lastUsedAt/createdAt history stays visible in
// the UI as "revoked" rather than just disappearing. The MCP server's
// lookup already filters on revokedAt IS NULL, so a revoked key stops
// working immediately regardless.
export async function DELETE(req: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { keyId } = await ctx.params;

  const [revoked] = await withUserContext(session.user.id, (tx) =>
    tx
      .update(mcpApiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(mcpApiKeys.id, keyId), eq(mcpApiKeys.userId, session.user.id)))
      .returning({ id: mcpApiKeys.id }),
  );

  if (!revoked) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
