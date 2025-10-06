import { afterEach } from 'vitest';
import { register } from 'prom-client';

/**
 * Global test cleanup
 * Runs after each test to prevent memory leaks
 */
afterEach(async () => {
  // Reset Prometheus metrics registry to prevent accumulation
  // Each test server re-registers ~40+ metrics; without this,
  // the global registry grows to 4GB+ across 60 test files
  try {
    register.clear();
  } catch {
    // ignore if not available
  }
  
  // Give event loop a tick to finish cleanup
  await new Promise(resolve => setImmediate(resolve));
  
  // Force GC if available (run tests with --expose-gc)
  if (global.gc) {
    global.gc();
    // Run GC twice to clean up both young and old generation
    global.gc();
  }
});
