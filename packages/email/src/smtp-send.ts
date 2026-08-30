import nodemailer from "nodemailer";

// Real SMTP send via the user's own connected mailbox (Gmail App Password,
// Outlook, Zoho, a custom domain inbox - anything that gives out SMTP
// credentials) - nodemailer is free, open-source, and works against any
// standard SMTP server, no vendor API/cost involved. The universal
// fallback for Backlink Outreach connections that aren't Gmail OAuth
// (see @rosterseo/google's gmail-send.ts for that path).

export interface SmtpConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string | null;
}

export async function sendSmtpMail(
  connection: SmtpConnection,
  params: { to: string; subject: string; body: string },
): Promise<{ messageId: string }> {
  const transporter = nodemailer.createTransport({
    host: connection.host,
    port: connection.port,
    // 465 is SMTPS (implicit TLS from the first byte); every other common
    // port (587 submission, 25) uses STARTTLS instead - nodemailer's own
    // `secure` flag maps directly to that split, not to "use TLS at all".
    secure: connection.port === 465,
    auth: { user: connection.username, pass: connection.password },
  });

  const info = await transporter.sendMail({
    to: params.to,
    from: connection.fromName ? `"${connection.fromName}" <${connection.fromEmail}>` : connection.fromEmail,
    subject: params.subject,
    text: params.body,
  });

  return { messageId: info.messageId };
}

// A cheap, real connectivity + auth check (SMTP AUTH handshake, no message
// sent) - used right after a user enters SMTP credentials so a typo'd
// password or wrong host surfaces immediately as "couldn't connect,"
// instead of only being discovered the first time a real outreach email
// tries to send.
export async function verifySmtpConnection(connection: Omit<SmtpConnection, "fromEmail" | "fromName">): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: connection.host,
    port: connection.port,
    secure: connection.port === 465,
    auth: { user: connection.username, pass: connection.password },
  });
  await transporter.verify();
}
