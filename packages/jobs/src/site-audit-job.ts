import { z } from "zod";
import { defineJob } from "./define-job";

const siteAuditSchema = z.object({
  auditId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string(),
  domain: z.string(),
  customSitemapUrl: z.string().optional(),
  maxPages: z.number().optional().default(200),
});

// expireInSeconds comfortably exceeds MAX_CRAWL_DURATION_MS (6hr, see
// apps/worker's crawler.ts) - pg-boss's 15-minute default expiry was
// causing a still-running crawl to get marked "stuck" and redelivered to a
// second worker pickup mid-crawl, which raced the first attempt's writes
// (the real cause of the crawl progress counter jumping non-monotonically).
// Raising this alone isn't enough on its own if the queue already exists
// in the database (pg-boss's createQueue() is create-only, silently a
// no-op after that - see define-job.ts's ensureQueue()) - that's exactly
// how this fix shipped once already but never took effect live.
export const siteAuditJob = defineJob("site_audit_job", siteAuditSchema, { expireInSeconds: 8 * 60 * 60 });
