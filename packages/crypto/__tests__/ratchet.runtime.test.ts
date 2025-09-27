import { beforeAll, describe, expect, it } from 'vitest';
import * as Ratchet from '../src/ratchet';
import { Sessions } from '../src/index';

const text = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);

let aliceKeys: Awaited<ReturnType<typeof Sessions.createSessionKeyPair>>;
let bobKeys: Awaited<ReturnType<typeof Sessions.createSessionKeyPair>>;
let aliceSecrets: Awaited<ReturnType<typeof Sessions.performHandshake>>;
let bobSecrets: Awaited<ReturnType<typeof Sessions.performHandshake>>;

beforeAll(async () => {
  aliceKeys = await Sessions.createSessionKeyPair();
  bobKeys = await Sessions.createSessionKeyPair();
  aliceSecrets = await Sessions.performHandshake(aliceKeys.secretKey, bobKeys.publicKey);
  bobSecrets = await Sessions.performHandshake(bobKeys.secretKey, aliceKeys.publicKey);
});

describe('Ratchet runtime', () => {
  it('performs encrypt/decrypt roundtrip', async () => {
    let aliceState = await Ratchet.initialize(aliceSecrets, aliceKeys, bobKeys.publicKey);
    let bobState = await Ratchet.initialize(bobSecrets, bobKeys, aliceKeys.publicKey);

    const send = await Ratchet.encrypt(aliceState, text('hello'));
    aliceState = send.state;
    const recv = await Ratchet.decrypt(bobState, send.envelope);
    bobState = recv.state;

    expect(decode(recv.plaintext)).toBe('hello');
    expect(bobState.receive.counter).toBe(1);
  });

  it('throws when decrypting previously processed header', async () => {
    let aliceState = await Ratchet.initialize(aliceSecrets, aliceKeys, bobKeys.publicKey);
    let bobState = await Ratchet.initialize(bobSecrets, bobKeys, aliceKeys.publicKey);

    const first = await Ratchet.encrypt(aliceState, text('first'));
    aliceState = first.state;
    const result = await Ratchet.decrypt(bobState, first.envelope);
    bobState = result.state;
    await expect(Ratchet.decrypt(bobState, first.envelope)).rejects.toThrow('header counter already processed');
  });

  it('prunes skipped entries when helper invoked', () => {
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

  it('stores and retrieves skipped entries via helpers', () => {
    const state: any = { maxSkipped: 2, skipped: new Map() };
    const header = { publicKey: aliceKeys.publicKey, counter: 1, previousCounter: 0 } as any;
    Ratchet.__testables.storeSkipped(state, header, aliceSecrets.rootKey);
    expect(state.skipped.size).toBe(1);
    const recovered = Ratchet.__testables.trySkipped(state, header);
    expect(recovered).toBe(aliceSecrets.rootKey);
    expect(state.skipped.size).toBe(0);
  });
});
