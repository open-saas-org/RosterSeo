import { z } from "zod";
import { defineJob } from "./define-job";

// Proves the enqueue -> worker -> complete pipeline end-to-end. Real job
// types (site_crawl, page_analyzer_run, ai_visibility_run, ...) get added
// the same way, next to the feature that owns them, once that feature exists.
export const pingJob = defineJob(
  "ping",
  z.object({
    message: z.string(),
    sentAt: z.string(),
  }),
);
