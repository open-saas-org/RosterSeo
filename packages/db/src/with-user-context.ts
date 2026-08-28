import { sql } from "drizzle-orm";
import { db } from "./index";

// Every tenant-scoped query must run through this. It opens a transaction,
// sets the session variable the RLS policies in drizzle/0001_rls_policies.sql
// check, then runs the callback against that transaction - never against
// the bare `db` export, or RLS silently returns zero rows instead of the
// expected data (fails closed, but "why is this query empty" is a bad time
// to discover that).
//
// Scoped by user, not org - see the comment at the top of
// drizzle/0001_rls_policies.sql for why.
export async function withUserContext<T>(
  userId: string,
  callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(..., true) is the "local to this transaction" form of SET.
    // Plain `SET LOCAL app.x = $1` doesn't accept bind parameters in
    // Postgres - set_config is the standard way to do this parameterized.
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return callback(tx);
  });
}
