import { z } from "zod";
import { defineJob } from "./define-job";

// Daily trigger - no payload, just a signal to find every published
// Facebook Page/Instagram/LinkedIn target (the only platforms with a
// fetchMetrics() implementation today, see packages/social) and enqueue a
// socialMetricsFetchJob for each. Same shape as localGridScanFanoutJob.
const socialMetricsFanoutSchema = z.object({});

export const socialMetricsFanoutJob = defineJob("social_metrics_fanout_job", socialMetricsFanoutSchema);
