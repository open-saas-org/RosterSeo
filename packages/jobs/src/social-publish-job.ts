import { z } from "zod";
import { defineJob } from "./define-job";

const socialPublishSchema = z.object({
  socialPostTargetId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string(),
});

// Same shape as blogPublishJob - one job per (post, platform) pair, so
// "Publish now" and "Schedule for later" share one path (via startAfter)
// and each platform succeeds/fails independently.
export const socialPublishJob = defineJob("social_publish_job", socialPublishSchema);
