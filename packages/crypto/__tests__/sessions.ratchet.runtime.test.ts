import { beforeAll, describe, expect, it } from 'vitest';
import * as Ratchet from '../src/sessions/ratchet';
import * as Sessions from '../src/sessions/handshake';

let aliceKeys: Awaited<ReturnType<typeof Sessions.createSessionKeyPair>>;
let bobKeys: Awaited<ReturnType<typeof Sessions.createSessionKeyPair>>;
let aliceSecrets: Awaited<ReturnType<typeof Sessions.performHandshake>>;

beforeAll(async () => {
  aliceKeys = await Sessions.createSessionKeyPair();
  bobKeys = await Sessions.createSessionKeyPair();
  aliceSecrets = await Sessions.performHandshake(aliceKeys.secretKey, bobKeys.publicKey);
});

describe('sessions/ratchet helpers', () => {
  it('prunes skipped queue when exceeding limit', () => {
    const state: any = {
      maxSkipped: 1,
      skipped: new Map([
        ['key:1', aliceSecrets.rootKey],
        ['key:2', aliceSecrets.chainKey]
      ])
    };
    Ratchet.__testables.pruneSkipped(state);
    expect(state.skipped.size).toBe(1);
  });

  it('throws when skipped limit is zero and helper invoked', () => {
    const state: any = { maxSkipped: 0, skipped: new Map() };
    expect(() => Ratchet.__testables.storeSkipped(state, { publicKey: aliceKeys.publicKey, counter: 1, previousCounter: 0 } as any, aliceSecrets.rootKey)).toThrow('Skipped message limit of 0 exceeded');
  });

  it('stores and retrieves skipped entries via helper', () => {
    const state: any = { maxSkipped: 2, skipped: new Map() };
    const header = { publicKey: aliceKeys.publicKey, counter: 1, previousCounter: 0 } as any;
    Ratchet.__testables.storeSkipped(state, header, aliceSecrets.rootKey);
    expect(state.skipped.size).toBe(1);
    const recovered = Ratchet.__testables.trySkipped(state, header);
    expect(recovered).toBe(aliceSecrets.rootKey);
    expect(state.skipped.size).toBe(0);
  });
});
