import { z } from "zod";
import { defineJob } from "./define-job";

// The weekly trigger - no payload, just a signal to enumerate every
// project with auto-tracking enabled and enqueue a localGridScanJob for
// each. Scheduled recurring via scheduleRecurring, see apps/worker.
const localGridScanFanoutSchema = z.object({});

export const localGridScanFanoutJob = defineJob("local_grid_scan_fanout_job", localGridScanFanoutSchema);
