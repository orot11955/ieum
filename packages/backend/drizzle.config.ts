import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/platform/database/schema.ts",
  out: "../../db/migrations/business",
  dialect: "postgresql",
  migrations: { schema: "drizzle_business", table: "__drizzle_migrations" },
  ...(process.env.MIGRATION_DATABASE_URL
    ? { dbCredentials: { url: process.env.MIGRATION_DATABASE_URL } }
    : {}),
});
