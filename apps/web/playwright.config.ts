import { defineConfig } from "@playwright/test";

const webOrigin = "http://127.0.0.1:4173";
const apiOrigin = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests",
  // One shared database: account-changing flows must not interleave.
  workers: 1,
  use: { baseURL: webOrigin, browserName: "chromium" },
  webServer: [
    {
      // Requires `pnpm build` (API dist) and Docker for the throwaway PostgreSQL.
      command: "node ../api/scripts/e2e-stack.mjs",
      url: `${apiOrigin}/health/live`,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: "pnpm dev --port 4173 --strictPort",
      url: webOrigin,
      env: { IEUM_API_ORIGIN: apiOrigin },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  reporter: process.env.CI ? "github" : "list",
});
