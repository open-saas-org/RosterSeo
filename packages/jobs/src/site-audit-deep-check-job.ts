import { z } from "zod";
import { defineJob } from "./define-job";

const siteAuditDeepCheckSchema = z.object({
  auditId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string(),
});

// Broken links (internal + external) + orphaned pages + keyword
// cannibalization - a separate, on-demand pass over an already-completed
// audit's data, not part of site_audit_job. External link checking (up to
// 300 URLs, 8s timeout each, concurrency 5) is the slow part here, so this
// gets its own generous expiry rather than sharing site_audit_job's.
export const siteAuditDeepCheckJob = defineJob("site_audit_deep_check_job", siteAuditDeepCheckSchema, { expireInSeconds: 1800 });
