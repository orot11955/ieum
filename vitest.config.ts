import { defineConfig } from 'vitest/config';
export default defineConfig({test:{
  include:['tests/unit/**/*.test.ts','tests/unit/**/*.test.tsx','tests/integration/**/*.test.ts'],
  environment:'node', testTimeout:60000, hookTimeout:60000, fileParallelism:false,
  restoreMocks:true,
}});
