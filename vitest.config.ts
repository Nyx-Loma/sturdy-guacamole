import { defineConfig, defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

const coverageThresholds = {
  provider: 'v8',
  reportsDirectory: './coverage',
  lines: 85,
  functions: 85,
  statements: 85,
  branches: 75,
  include: [
    'apps/**/src/**/*.ts',
    'packages/**/src/**/*.ts',
    'services/**/src/**/*.ts'
  ],
  exclude: [
    '**/dist/**',
    '**/__tests__/**',
    '**/tests/**',
    '**/*.d.ts',
    '**/scripts/**',
    '**/vitest.setup.ts'
  ],
  thresholds: {
    perFile: {
      'services/auth/src/**': {
        lines: 90,
        statements: 90,
        branches: 85,
        functions: 90
      },
      'packages/crypto/src/**': {
        lines: 85,
        statements: 85,
        branches: 75,
        functions: 80
      }
    }
  }
} as const;

const projects = [
  defineProject({
    test: {
      name: 'unit',
      include: [
        'packages/**/__tests__/**/*.test.ts',
        'services/**/src/tests/unit/**/*.test.ts',
        'services/**/tests/unit/**/*.test.ts',
        'apps/server/__tests__/**/*.test.ts'
      ],
      setupFiles: ['packages/crypto/vitest.setup.ts']
    }
  }),
  defineProject({
    test: {
      name: 'integration',
      include: [
        'services/**/src/tests/integration/**/*.test.ts',
        'services/**/src/tests/e2e/**/*.test.ts',
        'services/**/tests/integration/**/*.test.ts',
        'services/**/tests/e2e/**/*.test.ts'
      ],
      setupFiles: ['packages/crypto/vitest.setup.ts']
    }
  }),
  defineProject({
    test: {
      name: 'security',
      include: ['services/**/src/tests/security/**/*.test.ts', 'services/**/tests/security/**/*.test.ts'],
      setupFiles: ['packages/crypto/vitest.setup.ts']
    }
  })
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['vitest.global.setup.ts'],
    testTimeout: 15000,
    coverage: coverageThresholds,
    projects,
    include: ['services/**/src/tests/unit/**/*.test.ts', 'services/**/tests/unit/**/*.test.ts', 'packages/**/__tests__/**/*.test.ts', 'apps/server/__tests__/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@sanctum/config': path.resolve(rootDir, 'packages/config/src/index.ts'),
      '@sanctum/transport': path.resolve(rootDir, 'packages/transport/src/index.ts'),
      '@sanctum/crypto': path.resolve(rootDir, 'packages/crypto/src/index.ts')
    }
  }
});

