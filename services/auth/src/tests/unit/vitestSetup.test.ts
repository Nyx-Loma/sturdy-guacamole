import { describe, expect, it, vi } from 'vitest';

import type { Utils as EdUtilsType, Hashes as HashesType } from '@noble/ed25519';

describe('vitest setup overrides', () => {
  it('registers deterministic sha512 helpers for ed25519', async () => {
    vi.resetModules();

    // Import the setup file which patches noble/ed25519 utilities
    await import('../../../vitest.setup');

    const { utils, hashes }: { utils: EdUtilsType; hashes: HashesType } = await import('@noble/ed25519');

    const input = new Uint8Array([1, 2, 3, 4, 5]);
    const first = hashes.sha512(input);
    const second = hashes.sha512(input);

    expect(first).toBeInstanceOf(Uint8Array);
    expect(first.byteLength).toBe(64);
    expect(Buffer.from(first)).toEqual(Buffer.from(second));

    const syncResult = utils.sha512Sync(input);
    expect(Buffer.from(syncResult)).toEqual(Buffer.from(first));

    const asyncResult = await utils.sha512(input);
    expect(Buffer.from(asyncResult)).toEqual(Buffer.from(first));
  });
});
