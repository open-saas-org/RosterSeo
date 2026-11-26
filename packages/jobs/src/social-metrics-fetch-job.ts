import { z } from "zod";
import { defineJob } from "./define-job";

// Fetches and stores one published target's real platform engagement
// numbers (PUBLISHING_PLATFORM_PRD.md §3). Enqueued per-target by
// socialMetricsFanoutJob, never run synchronously from a request.
const socialMetricsFetchSchema = z.object({
  socialPostTargetId: z.string().uuid(),
  userId: z.string(),
});

export const socialMetricsFetchJob = defineJob("social_metrics_fetch_job", socialMetricsFetchSchema);
