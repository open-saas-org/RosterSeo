import { and, eq, gte } from "drizzle-orm";
import { emailConnections, outreachTargets, withUserContext } from "@seo-tool/db";
import { GoogleReauthRequiredError, refreshAccessToken, sendGmail } from "@seo-tool/google";
import { sendSmtpMail } from "@seo-tool/email";

// Refresh a bit before actual expiry, not right at it - same buffer/reasoning
// as apps/web/lib/google-token.ts, duplicated (not imported) since apps/worker
// can't reach into apps/web's `@/` path aliases, and this connection lives in
// email_connections, not google_connections, so it's not literally the same
// function anyway.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function getValidGmailAccessToken(userId: string, connection: typeof emailConnections.$inferSelect): Promise<string> {
  if (!connection.gmailRefreshToken) throw new Error(`Email connection ${connection.id} has no Gmail refresh token`);
  if (connection.gmailExpiresAt && connection.gmailExpiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now() && connection.gmailAccessToken) {
    return connection.gmailAccessToken;
  }

  try {
    const refreshed = await refreshAccessToken(connection.gmailRefreshToken);
    await withUserContext(userId, (tx) =>
      tx
        .update(emailConnections)
        .set({ gmailAccessToken: refreshed.accessToken, gmailExpiresAt: refreshed.expiresAt, gmailNeedsReconnect: false })
        .where(eq(emailConnections.id, connection.id)),
    );
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof GoogleReauthRequiredError) {
      await withUserContext(userId, (tx) => tx.update(emailConnections).set({ gmailNeedsReconnect: true }).where(eq(emailConnections.id, connection.id)));
    }
    throw err;
  }
}

// Processes one "send this outreach email" job. Enforces the connection's
// real daily send cap (email_connections.dailySendLimit) - the actual
// safeguard against a connected account's sender reputation getting
// damaged by sending too much cold outreach at once - by counting today's
// already-sent rows for this connection before sending. Over the cap: the
// target goes back to "drafted" with a clear reason, not silently retried
// or dropped, so the user can pick a different connection or just wait.
export async function runOutreachSend(payload: { outreachTargetId: string; projectId: string; userId: string }) {
  const { outreachTargetId, userId } = payload;

  const target = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(outreachTargets).where(eq(outreachTargets.id, outreachTargetId)).limit(1);
    return row ?? null;
  });

  if (!target) {
    console.error(`[outreach] target ${outreachTargetId} not found - skipping`);
    return;
  }
  if (!target.contactEmail || !target.subject || !target.body || !target.emailConnectionId) {
    await withUserContext(userId, (tx) =>
      tx
        .update(outreachTargets)
        .set({ status: "drafted", failureReason: "Missing recipient email, subject, body, or a chosen sender - can't send." })
        .where(eq(outreachTargets.id, outreachTargetId)),
    );
    return;
  }

  const connection = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(emailConnections).where(eq(emailConnections.id, target.emailConnectionId!)).limit(1);
    return row ?? null;
  });

  if (!connection) {
    await withUserContext(userId, (tx) =>
      tx.update(outreachTargets).set({ status: "drafted", failureReason: "The chosen sender was disconnected - pick another." }).where(eq(outreachTargets.id, outreachTargetId)),
    );
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sentToday = await withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({ id: outreachTargets.id })
      .from(outreachTargets)
      .where(and(eq(outreachTargets.emailConnectionId, connection.id), eq(outreachTargets.status, "sent"), gte(outreachTargets.sentAt, todayStart)));
    return rows.length;
  });

  if (sentToday >= connection.dailySendLimit) {
    await withUserContext(userId, (tx) =>
      tx
        .update(outreachTargets)
        .set({
          status: "drafted",
          failureReason: `"${connection.label}" has hit its daily send limit (${connection.dailySendLimit}) - try again tomorrow, or send from a different connection.`,
        })
        .where(eq(outreachTargets.id, outreachTargetId)),
    );
    return;
  }

  try {
    if (connection.type === "gmail_oauth") {
      const accessToken = await getValidGmailAccessToken(userId, connection);
      await sendGmail(accessToken, { to: target.contactEmail, from: connection.fromEmail, fromName: connection.fromName, subject: target.subject, body: target.body });
    } else {
      if (!connection.smtpHost || !connection.smtpPort || !connection.smtpUsername || !connection.smtpPasswordEncrypted) {
        throw new Error(`Email connection ${connection.id} is missing SMTP credentials`);
      }
      await sendSmtpMail(
        {
          host: connection.smtpHost,
          port: connection.smtpPort,
          username: connection.smtpUsername,
          password: connection.smtpPasswordEncrypted,
          fromEmail: connection.fromEmail,
          fromName: connection.fromName,
        },
        { to: target.contactEmail, subject: target.subject, body: target.body },
      );
    }

    await withUserContext(userId, (tx) =>
      tx.update(outreachTargets).set({ status: "sent", sentAt: new Date(), failureReason: null }).where(eq(outreachTargets.id, outreachTargetId)),
    );
  } catch (err) {
    console.error(`[outreach] send failed for target ${outreachTargetId}`, err);
    await withUserContext(userId, (tx) =>
      tx
        .update(outreachTargets)
        .set({ status: "failed", failureReason: err instanceof Error ? err.message : String(err) })
        .where(eq(outreachTargets.id, outreachTargetId)),
    );
  }
}
