import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sanctum/config': path.resolve(rootDir, 'packages/config/src/index.ts'),
      '@sanctum/transport': path.resolve(rootDir, 'packages/transport/src/index.ts'),
      '@sanctum/crypto/backup/derive': path.resolve(rootDir, 'packages/crypto/src/backup/derive.ts'),
      '@sanctum/crypto': path.resolve(rootDir, 'packages/crypto/src/index.ts'),
      '@fastify/cors': path.resolve(rootDir, 'test/stubs/fastify-cors.ts')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    isolate: true,
    setupFiles: ['./vitest.global.setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Use Vitest's default include: **/*.{test,spec}.?(c|m)[jt]s?(x)
    // Shards are driven via --dir flag in the sequential runner
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/**/__tests__/**/*.test.ts',
            'packages/**/__tests__/**/*.spec.ts',
            'services/**/__tests__/**/*.test.ts',
            'services/**/__tests__/**/*.spec.ts',
            'services/**/tests/unit/**/*.test.ts',
            'services/**/tests/unit/**/*.spec.ts',
            'services/**/src/tests/unit/**/*.test.ts',
            'services/**/src/tests/unit/**/*.spec.ts',
            'tests/**/*.test.ts',
            'tests/**/*.spec.ts'
          ],
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/*.integration.test.ts',
            '**/*.e2e.test.ts',
            '**/tests/integration/**',
            '**/tests/e2e/**',
            '**/src/tests/integration/**',
            '**/src/tests/e2e/**'
          ]
        }
      }
    ]
  }
});

