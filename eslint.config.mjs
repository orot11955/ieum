import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: [
    "packages/core/src/**/*.ts",
    "packages/contracts/src/**/*.ts",
    "packages/backend/{src,test}/**/*.ts",
    "apps/lab-cli/src/**/*.ts",
    "apps/api/{src,test}/**/*.ts",
    "apps/worker/{src,test}/**/*.ts",
    "packages/ui/src/**/*.tsx",
    "apps/web/{src,tests}/**/*.tsx",
    "apps/web/tests/**/*.ts",
    "apps/web/{vite,playwright}.config.ts",
  ],
  extends: [tseslint.configs.recommended],
});
