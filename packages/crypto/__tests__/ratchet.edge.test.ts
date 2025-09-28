import { describe, it, expect } from 'vitest';
import * as Ratchet from '../src/ratchet';
import { brandSymmetricKey } from '../src/types';

describe('ratchet edge cases', () => {
  it('prunes skipped when exceeding limit', () => {
    const state = {
      rootKey: brandSymmetricKey(new Uint8Array(32)),
      send: { chainKey: brandSymmetricKey(new Uint8Array(32)), counter: 0 },
      receive: { chainKey: brandSymmetricKey(new Uint8Array(32)), counter: 0 },
      localKeyPair: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(32) },
      remotePublicKey: new Uint8Array(32),
      skipped: new Map<string, ReturnType<typeof brandSymmetricKey>>(),
      maxSkipped: 3
    } as any;
    // store 5 keys
    for (let i = 1; i <= 5; i += 1) {
      Ratchet.__testables.storeSkipped(state, { publicKey: new Uint8Array(32), counter: i, previousCounter: i - 1 } as any, brandSymmetricKey(new Uint8Array(32)));
    }
    expect(state.skipped.size).toBeLessThanOrEqual(3);
  });

  it('trySkipped returns and deletes stored key', () => {
    const state = {
      skipped: new Map<string, ReturnType<typeof brandSymmetricKey>>()
    } as any;
    const header = { publicKey: new Uint8Array([1]), counter: 1 } as any;
    const key = brandSymmetricKey(new Uint8Array(32));
    (state.skipped as Map<string, any>).set(`${Buffer.from(header.publicKey).toString('base64url')}:${header.counter}`, key);
    const found = Ratchet.__testables.trySkipped(state, header);
    expect(found).toBeDefined();
    expect(state.skipped.size).toBe(0);
  });
});


