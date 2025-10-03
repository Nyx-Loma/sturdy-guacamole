import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/storage/tests/integration/**/*.test.ts"],
    setupFiles: ["packages/storage/tests/integration/setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globals: true,
    reporters: process.env.CI ? ["default", "junit"] : "default",
    outputFile: process.env.CI ? "reports/vitest-adapters.xml" : undefined,
    sequence: {
      shuffle: false,
      concurrent: false,
    },
  },
});


