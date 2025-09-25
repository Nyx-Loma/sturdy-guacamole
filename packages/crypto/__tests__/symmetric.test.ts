import { describe, expect, it, beforeAll } from 'vitest';
import { encrypt, decrypt, randomNonce } from '../src/symmetric';
import { ensureSodium } from '../src/sodium/init';
import { brandSymmetricKey } from '../src/types';

let sodium: Awaited<ReturnType<typeof ensureSodium>>;

beforeAll(async () => {
  sodium = await ensureSodium();
});

describe('symmetric encryption', () => {
  it('encrypts and decrypts with additional data', async () => {
    const keyBytes = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
    const key = brandSymmetricKey(new Uint8Array(keyBytes));
    const nonce = await randomNonce();
    const plaintext = new TextEncoder().encode('secret message');
    const ad = new TextEncoder().encode('header');

    const ciphertext = await encrypt(key, plaintext, nonce, { additionalData: ad });
    const decrypted = await decrypt(key, ciphertext, nonce, { additionalData: ad });

    expect(new TextDecoder().decode(decrypted)).toBe('secret message');
  });

  it('fails to decrypt with wrong additional data', async () => {
    const key = brandSymmetricKey(new Uint8Array(sodium.crypto_aead_xchacha20poly1305_ietf_keygen()));
    const nonce = await randomNonce();
    const plaintext = new TextEncoder().encode('secret message');
    const ciphertext = await encrypt(key, plaintext, nonce, { additionalData: new Uint8Array([1, 2, 3]) });

    await expect(async () => {
      await decrypt(key, ciphertext, nonce, { additionalData: new Uint8Array([4, 5, 6]) });
    }).rejects.toThrow();
  });
});

