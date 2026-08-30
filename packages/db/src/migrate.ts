import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(dirname, "..", "drizzle");

// drizzle-orm's migrator decides what to apply by comparing TIMESTAMPS
// (each journal entry's `when` vs. the last-applied row's `created_at`),
// not by content hash, despite this package's own README previously
// implying otherwise. If a journal entry's `when` value is ever smaller
// than the already-applied max `created_at` - possible after any manual
// timestamp patch, clock skew between environments, or migrating in two
// separate passes that straddle an out-of-order entry - that migration is
// silently skipped with no error. This happened twice in this repo's own
// history and was only caught by manually inspecting the database.
//
// This check runs after every real migrate() call and fails loudly instead
// of trusting "no error thrown" to mean "schema is actually up to date":
// every migration file listed in the journal must have a matching row in
// __drizzle_migrations by real content hash (recomputed here the same way
// drizzle-orm computes it - sha256 of the raw file contents).
async function assertMigrationsApplied(db: ReturnType<typeof drizzle>) {
  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };

  const appliedRows = await db.execute<{ hash: string }>(sql`select hash from drizzle.__drizzle_migrations`);
  const appliedHashes = new Set(appliedRows.rows.map((r) => r.hash));

  const missing: string[] = [];
  for (const entry of journal.entries) {
    const filePath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    const contents = fs.readFileSync(filePath, "utf8");
    const hash = crypto.createHash("sha256").update(contents).digest("hex");
    if (!appliedHashes.has(hash)) missing.push(entry.tag);
  }

  if (missing.length > 0) {
    throw new Error(
      `Migration integrity check failed: ${missing.length} migration(s) exist in drizzle/meta/_journal.json but were NOT applied to the database (drizzle-orm's migrator likely skipped them due to a timestamp ordering issue, not a real error): ${missing.join(", ")}. ` +
        `Apply the SQL in each listed file manually (e.g. via psql), then insert a matching row into drizzle.__drizzle_migrations with that file's real sha256 hash and a created_at greater than the current max, so future migrate runs stay consistent.`,
    );
  }
}

async function main() {
  // Migrations run DDL (ALTER TABLE ... ENABLE ROW LEVEL SECURITY, CREATE
  // POLICY), which requires the table owner or a superuser - the app's own
  // runtime DATABASE_URL is deliberately a restricted, non-superuser role
  // (see packages/db/README.md) so RLS actually applies to it. Use the
  // elevated connection for migrations, falling back to DATABASE_URL for
  // quick local setups that aren't bothering with the role split.
  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  // Absolute (MIGRATIONS_DIR, computed above from this file's own real
  // location), not the relative "./drizzle" this used to pass - that only
  // ever worked by accident, because `pnpm --filter @rosterseo/db migrate`
  // happens to run with cwd already set to this package's own directory.
  // Any other real invocation - the bundled dist/migrate.mjs run from the
  // Docker image's WORKDIR (railway.toml's releaseCommand), or simply
  // running this script from the repo root - resolved "./drizzle" against
  // the WRONG directory and failed with "Can't find meta/_journal.json".
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await assertMigrationsApplied(db);
  await pool.end();
  console.log("Migrations complete - verified every journal entry is actually applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
