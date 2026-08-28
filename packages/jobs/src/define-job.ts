import type { z } from "zod";
import type { Queue, ScheduleOptions, SendOptions } from "pg-boss";
import { getBoss } from "./client";

// Typed wrapper around a pg-boss queue: one call site defines the queue name,
// its payload shape, and gets back a matching enqueue()/work() pair so the
// producer (a Route Handler) and the consumer (apps/worker) can't drift apart.
//
// queueOptions (currently just expireInSeconds) applies to every job on
// this queue - use it for anything that can legitimately run longer than
// pg-boss's default 15-minute expiry (site_audit_job's real crawl can run
// up to an hour; see MAX_CRAWL_DURATION_MS in apps/worker's crawler.ts).
// Without this, pg-boss decides a still-healthy long-running job is "stuck"
// after 15 minutes and redelivers it to a second worker pickup - which then
// runs runSiteAuditBackground's own "clear stale data from a retried
// attempt" logic *while the first attempt is still actively crawling*,
// wiping its progress and racing it to write pagesCrawled - the real cause
// behind the crawl progress counter jumping around instead of climbing.
//
// pg-boss's own createQueue() is create-ONLY under the hood (its SQL is a
// plain `INSERT ... ON CONFLICT DO NOTHING`) - once a queue row exists
// (e.g. from before queueOptions was added to a call site, or from an
// earlier deploy), createQueue() silently no-ops forever after, even
// though it looks like it succeeded. That's exactly how this exact
// expiry fix shipped once already but never actually took effect - the
// live `site_audit_job` queue kept its original 900s expiry until this
// comment was written. ensureQueue() closes that gap: after the (still
// necessary, for a queue that's never existed) createQueue() call, it
// explicitly updateQueue()s too whenever real options are given, so an
// already-existing queue's config gets corrected instead of silently
// staying stale.
async function ensureQueue(boss: Awaited<ReturnType<typeof getBoss>>, queueName: string, queueOptions?: Omit<Queue, "name">) {
  await boss.createQueue(queueName, queueOptions);
  if (queueOptions && Object.keys(queueOptions).length > 0) {
    await boss.updateQueue(queueName, queueOptions);
  }
}

export function defineJob<Schema extends z.ZodType>(queueName: string, payloadSchema: Schema, queueOptions?: Omit<Queue, "name">) {
  return {
    queueName,
    schema: payloadSchema,
    // options forwards straight to pg-boss's own SendOptions - in practice
    // just `{ startAfter }` for a future-dated single send (Publish's
    // "Schedule for later"), which pg-boss already supports natively.
    // Omit it (or startAfter) for an ASAP send.
    async enqueue(payload: z.infer<Schema>, options?: SendOptions) {
      const boss = await getBoss();
      const parsed = payloadSchema.parse(payload);
      await ensureQueue(boss, queueName, queueOptions);
      return boss.send(queueName, parsed, options);
    },
    async work(handler: (payload: z.infer<Schema>) => Promise<void>) {
      const boss = await getBoss();
      await ensureQueue(boss, queueName, queueOptions);
      await boss.work<z.infer<Schema>>(queueName, async ([job]) => {
        await handler(payloadSchema.parse(job.data));
      });
    },
    // Registers a recurring firing of this queue via pg-boss's cron
    // scheduler (boss.schedule upserts by name, so calling this on every
    // worker boot is safe/idempotent - it does not create duplicate
    // schedules). Call once at worker startup, alongside .work().
    async scheduleRecurring(cron: string, payload: z.infer<Schema>, options?: ScheduleOptions) {
      const boss = await getBoss();
      const parsed = payloadSchema.parse(payload);
      await ensureQueue(boss, queueName, queueOptions);
      await boss.schedule(queueName, cron, parsed, options);
    },
  };
}
