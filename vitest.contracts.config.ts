import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/storage/tests/contracts/**/*.test.ts"],
    globals: true,
    environment: "node",
  },
});


