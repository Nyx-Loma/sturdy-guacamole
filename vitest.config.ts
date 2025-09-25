import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    include: ['packages/**/__tests__/**/*.test.ts', 'apps/**/__tests__/**/*.test.ts'],
    testTimeout: 15000
  },
  resolve: {
    alias: {
      '@arqivo/config': path.resolve(rootDir, 'packages/config/src/index.ts'),
      '@arqivo/transport': path.resolve(rootDir, 'packages/transport/src/index.ts')
    }
  }
});

