import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["packages/core/src/**/*.ts", "apps/lab-cli/src/**/*.ts"],
  extends: [tseslint.configs.recommended],
});
