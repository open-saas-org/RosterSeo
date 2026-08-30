import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/{auth,app}-schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit generate doesn't need a live connection, but `migrate`
    // (packages/db/src/migrate.ts) and any interactive drizzle-kit command
    // that does connect should use the elevated role - see that file.
    url:
      process.env.DATABASE_MIGRATE_URL ??
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/rosterseo",
  },
});
