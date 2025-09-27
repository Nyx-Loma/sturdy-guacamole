import { describe, expect, it } from 'vitest';
import { __testables, type DoubleRatchetState } from '../src/ratchet';
import { brandSymmetricKey } from '../src/types';

const makeState = (overrides: Partial<DoubleRatchetState> = {}): DoubleRatchetState => ({
  rootKey: brandSymmetricKey(new Uint8Array(32)),
  send: { chainKey: brandSymmetricKey(new Uint8Array(32)), counter: 0 },
  receive: { chainKey: brandSymmetricKey(new Uint8Array(32)), counter: 0 },
  localKeyPair: { publicKey: new Uint8Array(32) as any, secretKey: new Uint8Array(32) as any },
  remotePublicKey: new Uint8Array(32) as any,
  skipped: new Map(),
  maxSkipped: 3,
  ...overrides
});

describe('ratchet helpers', () => {
  it('storeSkipped prunes when exceeding maxSkipped', () => {
    const state = makeState({ maxSkipped: 2 });
    const key = new Uint8Array(32) as any;
    __testables.storeSkipped(state, { publicKey: key, counter: 1, previousCounter: 0 }, brandSymmetricKey(new Uint8Array(32)));
    __testables.storeSkipped(state, { publicKey: key, counter: 2, previousCounter: 1 }, brandSymmetricKey(new Uint8Array(32)));
    __testables.storeSkipped(state, { publicKey: key, counter: 3, previousCounter: 2 }, brandSymmetricKey(new Uint8Array(32)));
    expect(state.skipped.size).toBeLessThanOrEqual(2);
    expect([...state.skipped.keys()].every((entry) => entry.includes(':'))).toBe(true);
  });

  it('trySkipped retrieves and removes stored key', () => {
    const state = makeState();
    const header = { publicKey: state.remotePublicKey, counter: 5, previousCounter: 4 };
    const key = brandSymmetricKey(new Uint8Array(32));
    __testables.storeSkipped(state, header, key);
    expect(__testables.trySkipped(state, header)).toBe(key);
    expect(__testables.trySkipped(state, header)).toBeUndefined();
  });
});
