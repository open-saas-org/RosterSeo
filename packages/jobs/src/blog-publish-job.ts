import { z } from "zod";
import { defineJob } from "./define-job";

const blogPublishSchema = z.object({
  blogPostTargetId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string(),
});

// One job per (post, platform) pair - queued rather than sent inline so
// "Publish now" and "Schedule for later" both go through the exact same
// path (the difference is just whether enqueue() is called with a
// startAfter option), and so each platform succeeds/fails independently.
export const blogPublishJob = defineJob("blog_publish_job", blogPublishSchema);
