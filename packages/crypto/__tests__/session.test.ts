import { describe, expect, it, beforeAll } from 'vitest';
import { createSessionKeyPair, performHandshake } from '../src/session';
import { ensureSodium } from '../src/sodium/init';

beforeAll(async () => {
  await ensureSodium();
});

describe('session handshake', () => {
  it('derives shared secrets', async () => {
    const alice = await createSessionKeyPair();
    const bob = await createSessionKeyPair();

    const aliceSecrets = await performHandshake(alice.secretKey, bob.publicKey);
    const bobSecrets = await performHandshake(bob.secretKey, alice.publicKey);

    expect(aliceSecrets.rootKey).toEqual(bobSecrets.rootKey);
    expect(aliceSecrets.chainKey).toEqual(bobSecrets.chainKey);
  });
});

