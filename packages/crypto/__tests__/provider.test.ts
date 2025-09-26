import { describe, expect, it, beforeAll } from 'vitest';
import { createCryptoProvider } from '../src/provider';
import { ensureSodium } from '../src/sodium/init';
import { brandSymmetricKey } from '../src/types';
import { deriveSymmetricKey } from '../src/primitives/symmetric';

beforeAll(async () => {
  await ensureSodium();
});

describe('crypto provider', () => {
  it('encrypts and decrypts end-to-end', async () => {
    const provider = createCryptoProvider();
    const keyBytes = await provider.randomBytes(32);
    const key = brandSymmetricKey(keyBytes);
    const nonce = await provider.randomBytes(24);
    const plaintext = new TextEncoder().encode('provider secret');

    const ciphertext = await provider.encrypt(key, plaintext, nonce);
    const { plaintext: decrypted } = await provider.decrypt(key, ciphertext, nonce);

    expect(new TextDecoder().decode(decrypted)).toBe('provider secret');
  });

  it('signs and verifies using underlying modules', async () => {
    const provider = createCryptoProvider();
    const { publicKey, secretKey } = await provider.generateKeyPair();
    const message = new TextEncoder().encode('provider message');
    const signature = await provider.sign(secretKey, message);
    const valid = await provider.verify(publicKey, message, signature);
    expect(valid).toBe(true);
  });

  it('produces unique random material', async () => {
    const provider = createCryptoProvider();
    const buf1 = await provider.randomBytes(32);
    const buf2 = await provider.randomBytes(32);
    expect(buf1).not.toEqual(buf2);
  });

  it('derives symmetric keys deterministically with same parameters', async () => {
    const provider = createCryptoProvider();
    const ikm = new TextEncoder().encode('shared secret');
    const info = new TextEncoder().encode('context');
    const salt = new TextEncoder().encode('salt');

    const key1 = await provider.deriveSymmetricKey(ikm, info, salt);
    const key2 = await deriveSymmetricKey(ikm, info, salt);

    expect(key1).toEqual(key2);
  });
});

