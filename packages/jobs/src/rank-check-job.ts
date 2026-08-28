import { z } from "zod";
import { defineJob } from "./define-job";

const rankCheckSchema = z.object({
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string(),
  keywordIds: z.array(z.string().uuid()),
});

export const rankCheckJob = defineJob("rank_check_job", rankCheckSchema);
