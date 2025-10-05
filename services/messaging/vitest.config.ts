import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    isolate: true,
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run all tests in a single worker for memory stability
      },
    },
    maxWorkers: 1,
  },
  coverage: {
    provider: 'istanbul', // istanbul is lighter and more memory-efficient than v8
    reporter: ['text', 'lcov'],
    reportsDirectory: './coverage',
    all: false, // Only instrument files imported by tests, not the entire tree
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      '**/*.test.*',
      '**/__tests__/**',
      '**/tests/**',
      'src/**/fixtures/**',
      'src/**/migrations/**',
      'src/**/scripts/**',
      'src/**/generated/**',
      '**/*.d.ts',
    ],
    clean: true,
  },
});

