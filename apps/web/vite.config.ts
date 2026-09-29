import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API checks Host and Origin against AUTH_BASE_URL, so the browser must see
// one origin: this server. The proxy keeps the original Host header.
const apiOrigin = process.env.IEUM_API_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  server: {
    proxy: { "/api": { target: apiOrigin, changeOrigin: false } },
  },
});
