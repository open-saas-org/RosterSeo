import "./instrument";
import "./spend-logging";

import * as Sentry from "@sentry/node";
import {
  pingJob,
  siteAuditJob,
  siteAuditDeepCheckJob,
  localGridScanJob,
  localGridScanFanoutJob,
  rankCheckJob,
  outreachSendJob,
  blogPublishJob,
  socialPublishJob,
  socialMetricsFetchJob,
  socialMetricsFanoutJob,
} from "@rosterseo/jobs";
import { runSiteAuditBackground } from "./features/audit-runner";
import { runSiteAuditDeepCheck } from "./features/site-audit-deep-check-runner";
import { runProjectGridScan, runWeeklyFanout } from "./features/grid-scan-runner";
import { runRankCheck } from "./features/rank-check-runner";
import { runOutreachSend } from "./features/outreach-runner";
import { runBlogPublish } from "./features/blog-publish-runner";
import { runSocialPublish } from "./features/social-publish-runner";
import { runFetchSocialMetrics, runSocialMetricsFanout } from "./features/social-metrics-runner";

// Add one `await <job>.work(handler)` per job type as features land
// (site_crawl, page_analyzer_run, ai_visibility_run, ...). Each job's
// definition lives in the package that owns the domain logic; this file
// just wires them up to run in this process. Wrap each handler body in
// try/catch + Sentry.captureException, following the pattern below - pg-boss
// already retries failed jobs, but silent failures are worse than retried
// ones, and Sentry.captureException is a no-op without SENTRY_DSN set.
await pingJob.work(async (payload) => {
  try {
    console.log(`[ping] ${payload.message} (sent ${payload.sentAt})`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await siteAuditJob.work(async (payload) => {
  try {
    console.log(`[site-audit] Starting audit ${payload.auditId} for ${payload.domain}`);
    await runSiteAuditBackground(payload);
    console.log(`[site-audit] Completed audit ${payload.auditId}`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await siteAuditDeepCheckJob.work(async (payload) => {
  try {
    console.log(`[site-audit-deep-check] Starting deep check for audit ${payload.auditId}`);
    await runSiteAuditDeepCheck(payload);
    console.log(`[site-audit-deep-check] Completed deep check for audit ${payload.auditId}`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await localGridScanJob.work(async (payload) => {
  try {
    console.log(`[local-grid-scan] Starting scan for project ${payload.projectId}`);
    await runProjectGridScan(payload.projectId, payload.userId);
    console.log(`[local-grid-scan] Completed scan for project ${payload.projectId}`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await localGridScanFanoutJob.work(async () => {
  try {
    console.log("[local-grid-scan-fanout] Starting weekly fanout");
    await runWeeklyFanout();
    console.log("[local-grid-scan-fanout] Completed weekly fanout");
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await rankCheckJob.work(async (payload) => {
  try {
    console.log(`[rank-check] Starting run ${payload.runId} for project ${payload.projectId} (${payload.keywordIds.length} keywords)`);
    await runRankCheck(payload);
    console.log(`[rank-check] Completed run ${payload.runId}`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await outreachSendJob.work(async (payload) => {
  try {
    console.log(`[outreach] Sending target ${payload.outreachTargetId}`);
    await runOutreachSend(payload);
    console.log(`[outreach] Done with target ${payload.outreachTargetId}`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await blogPublishJob.work(async (payload) => {
  try {
    console.log(`[publish] Sending target ${payload.blogPostTargetId}`);
    await runBlogPublish(payload);
    console.log(`[publish] Done with target ${payload.blogPostTargetId}`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await socialPublishJob.work(async (payload) => {
  try {
    console.log(`[social] Sending target ${payload.socialPostTargetId}`);
    await runSocialPublish(payload);
    console.log(`[social] Done with target ${payload.socialPostTargetId}`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await socialMetricsFetchJob.work(async (payload) => {
  try {
    console.log(`[social-metrics] Fetching metrics for target ${payload.socialPostTargetId}`);
    await runFetchSocialMetrics(payload);
    console.log(`[social-metrics] Done with target ${payload.socialPostTargetId}`);
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

await socialMetricsFanoutJob.work(async () => {
  try {
    console.log("[social-metrics-fanout] Starting daily fanout");
    await runSocialMetricsFanout();
    console.log("[social-metrics-fanout] Completed daily fanout");
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

// Monday 3am UTC. boss.schedule upserts by name, so registering this on
// every boot is safe - it doesn't create duplicate schedules.
await localGridScanFanoutJob.scheduleRecurring("0 3 * * 1", {}, { tz: "UTC" });
// Daily 4am UTC - an hour after the weekly local-grid fanout, same
// stagger-the-cron-starts reasoning, nothing load-bearing about the
// specific hour.
await socialMetricsFanoutJob.scheduleRecurring("0 4 * * *", {}, { tz: "UTC" });

console.log("Worker started, listening for jobs.");
