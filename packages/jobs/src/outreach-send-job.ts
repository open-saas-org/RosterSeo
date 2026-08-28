import { z } from "zod";
import { defineJob } from "./define-job";

const outreachSendSchema = z.object({
  outreachTargetId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string(),
});

// One job per "send this outreach email" click - queued rather than sent
// inline so the send job can enforce per-connection daily pacing (see
// email_connections.dailySendLimit) instead of firing instantly, which is
// what actually protects a connected account's sender reputation.
export const outreachSendJob = defineJob("outreach_send_job", outreachSendSchema);
