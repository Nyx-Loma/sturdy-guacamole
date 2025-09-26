import { defineConfig } from 'vitest/config';
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
  {
    name: 'unit',
    test: {
      include: [
        'packages/**/__tests__/**/*.test.ts',
        'services/**/src/tests/unit/**/*.test.ts'
      ],
      setupFiles: ['packages/crypto/vitest.setup.ts']
    }
  },
  {
    name: 'integration',
    test: {
      include: ['services/**/src/tests/integration/**/*.test.ts', 'services/**/src/tests/e2e/**/*.test.ts'],
      setupFiles: ['packages/crypto/vitest.setup.ts']
    }
  },
  {
    name: 'security',
    test: {
      include: ['services/**/src/tests/security/**/*.test.ts'],
      setupFiles: ['packages/crypto/vitest.setup.ts']
    }
  }
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['vitest.global.setup.ts'],
    testTimeout: 15000,
    coverage: coverageThresholds,
    projects
  },
  resolve: {
    alias: {
      '@arqivo/config': path.resolve(rootDir, 'packages/config/src/index.ts'),
      '@arqivo/transport': path.resolve(rootDir, 'packages/transport/src/index.ts'),
      '@arqivo/crypto': path.resolve(rootDir, 'packages/crypto/src/index.ts')
    }
  }
});

