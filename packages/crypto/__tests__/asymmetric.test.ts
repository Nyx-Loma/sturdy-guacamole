import { describe, expect, it, beforeAll } from 'vitest';
import { generateSigningKeyPair, sign, verify } from '../src/asymmetric';
import { ensureSodium } from '../src/sodium/init';

beforeAll(async () => {
  await ensureSodium();
});

describe('asymmetric signatures', () => {
  it('signs and verifies messages', async () => {
    const { publicKey, secretKey } = await generateSigningKeyPair();
    const message = new TextEncoder().encode('hello');
    const signature = await sign(message, secretKey);
    const valid = await verify(message, signature, publicKey);
    expect(valid).toBe(true);
  });

  it('rejects tampered messages', async () => {
    const { publicKey, secretKey } = await generateSigningKeyPair();
    const message = new TextEncoder().encode('hello');
    const signature = await sign(message, secretKey);
    const tampered = new TextEncoder().encode('hello!');
    const valid = await verify(tampered, signature, publicKey);
    expect(valid).toBe(false);
  });

  it('matches Ed25519 test vector', async () => {
    const sodium = await ensureSodium();
    const message = new Uint8Array([0x72]);
    const seed = new Uint8Array(
      sodium.from_hex(
        '9d61b19deffd5a60ba844af492ec2cc4' +
          '4449c5697b326919703bac031cae7f60'
      )
    );
    const keyPair = sodium.crypto_sign_seed_keypair(seed, 'uint8array');
    const signature = await sign(message, keyPair.privateKey as Uint8Array);
    const expected = new Uint8Array(
      sodium.crypto_sign_detached(message, keyPair.privateKey as Uint8Array)
    );

    expect(signature).toEqual(expected);
    const valid = await verify(message, signature, keyPair.publicKey as Uint8Array);
    expect(valid).toBe(true);
  });
});

