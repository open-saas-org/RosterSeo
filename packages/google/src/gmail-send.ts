import { google } from "googleapis";

// Real Gmail API send - the message actually goes out through the
// connected Gmail account's own infrastructure (same as if the user hit
// "Send" in Gmail themselves), which is what gives Backlink Outreach mail
// the connected account's existing sender reputation instead of a fresh,
// unproven one.

function encodeSubject(subject: string): string {
  // RFC 2047 encoded-word - needed the moment a subject has a non-ASCII
  // character (an accented name, an em dash, etc.); plain ASCII subjects
  // pass through unaffected since base64-encoding them would just be
  // needless overhead, not a correctness issue, but doing it unconditionally
  // is simpler and always correct.
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildRawMessage(params: { to: string; from: string; fromName?: string | null; subject: string; body: string }): string {
  const fromHeader = params.fromName ? `${params.fromName} <${params.from}>` : params.from;
  const lines = [
    `To: ${params.to}`,
    `From: ${fromHeader}`,
    `Subject: ${encodeSubject(params.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    params.body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export async function sendGmail(
  accessToken: string,
  params: { to: string; from: string; fromName?: string | null; subject: string; body: string },
): Promise<{ messageId: string }> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: buildRawMessage(params) },
  });

  if (!data.id) throw new Error("Gmail API didn't return a message id after sending");
  return { messageId: data.id };
}
