import { defineConfig } from '@stryker-mutator/core';

export default defineConfig({
  mutate: ['src/**/*.ts', '!src/tests/**/*.ts', '!src/**/__tests__/**/*.ts'],
  testRunner: 'vitest',
  vitest: {
    configFile: './vitest.config.ts',
    project: 'unit'
  },
  reporters: ['progress', 'clear-text'],
  thresholds: {
    high: 90,
    low: 80,
    break: 75
  }
});

