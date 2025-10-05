import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    minThreads: 1,
    maxThreads: 1,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});

