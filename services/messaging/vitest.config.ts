import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      lines: 85,
      functions: 85,
      statements: 85,
      branches: 75
    }
  }
});

