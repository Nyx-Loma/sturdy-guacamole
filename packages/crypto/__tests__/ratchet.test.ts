import { describe, expect, it, beforeAll } from 'vitest';
import { createSessionKeyPair, performHandshake } from '../src/session';
import { initializeRatchet, nextMessageKey } from '../src/ratchet';
import { ensureSodium } from '../src/sodium/init';

beforeAll(async () => {
  await ensureSodium();
});

describe('simple ratchet', () => {
  it('derives deterministic message keys for both parties', async () => {
    const alice = await createSessionKeyPair();
    const bob = await createSessionKeyPair();

    const shared1 = await performHandshake(alice.secretKey, bob.publicKey);
    const shared2 = await performHandshake(bob.secretKey, alice.publicKey);

    let aliceState = initializeRatchet(shared1);
    let bobState = initializeRatchet(shared2);

    const send = await nextMessageKey(aliceState);
    aliceState = send.state;
    const recv = await nextMessageKey(bobState);
    bobState = recv.state;

    expect(send.messageKey).toEqual(recv.messageKey);
  });
});

