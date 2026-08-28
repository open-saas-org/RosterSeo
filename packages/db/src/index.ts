import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "./auth-schema";
import * as appSchema from "./app-schema";

export const schema = { ...authSchema, ...appSchema };
export * from "./auth-schema";
export * from "./app-schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export { withUserContext } from "./with-user-context";
export { insertSpendLog, type SpendLogInput } from "./spend-logger";
