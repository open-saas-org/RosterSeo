import { PgBoss } from "pg-boss";

let boss: PgBoss | undefined;

// Shared singleton so `apps/web` (enqueue) and `apps/worker` (process) both
// talk to the same underlying connection pool instead of each rolling their own.
export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss(process.env.DATABASE_URL ?? "");
  boss.on("error", (error) => console.error("[pg-boss]", error));
  await boss.start();
  return boss;
}
