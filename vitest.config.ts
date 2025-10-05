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
    hookTimeout: 30_000
    // Use Vitest's default include: **/*.{test,spec}.?(c|m)[jt]s?(x)
    // Shards are driven via --dir flag in the sequential runner
  }
});

