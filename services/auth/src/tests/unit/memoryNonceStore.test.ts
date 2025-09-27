import { describe, expect, it } from 'vitest';
import { createMemoryNonceStore } from '../../adapters/memoryNonceStore';

describe('nonce stores', () => {
  it('memory store issues and consumes once', async () => {
    const store = createMemoryNonceStore();
    await store.issue('device', 'nonce', 1000);
    expect(await store.consume('device', 'nonce')).toBe(true);
    expect(await store.consume('device', 'nonce')).toBe(false);
  });

  // redis-backed store is covered in integration tests
});


