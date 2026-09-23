import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/auth/schema.ts",
  out: "../../db/migrations/auth",
  dialect: "postgresql",
  ...(process.env.AUTH_DATABASE_URL
    ? { dbCredentials: { url: process.env.AUTH_DATABASE_URL } }
    : {}),
});
