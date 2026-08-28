import { z } from "zod";
import { defineJob } from "./define-job";

const localGridScanSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string(),
});

export const localGridScanJob = defineJob("local_grid_scan_job", localGridScanSchema);
