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
    const keyBytes = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
    const key = brandSymmetricKey(new Uint8Array(keyBytes));
    const nonce = await randomNonce();
    const plaintext = new TextEncoder().encode('secret message');
    const ad1 = new Uint8Array([1, 2, 3]);
    const ad2 = new Uint8Array([4, 5, 6]);
    const ciphertext = await encrypt(key, plaintext, nonce, { additionalData: ad1 });

    await expect(async () => {
      await decrypt(key, ciphertext, nonce, { additionalData: ad2 });
    }).rejects.toThrow();
  });

  it('matches libsodium XChaCha20-Poly1305 test vector', async () => {
    const key = brandSymmetricKey(new Uint8Array(sodium.from_hex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f')));
    const nonce = new Uint8Array(sodium.from_hex('404142434445464748494a4b4c4d4e4f5051525354555657'));
    const ad = new Uint8Array(sodium.from_hex('505152535455565758595a5b5c5d5e5f'));
    const plaintext = new Uint8Array(sodium.from_hex('4c616469657320616e642047656e746c656d656e2065617465617465206d6f7265206d65617420616e642067726f776e206d656174')); // "Ladies and Gentlemen eat more meat"

    const ciphertext = await encrypt(key, plaintext, nonce, { additionalData: ad });
    const expected = new Uint8Array(sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, ad, undefined, nonce, key));
    expect(ciphertext).toEqual(expected);
    const decrypted = await decrypt(key, ciphertext, nonce, { additionalData: ad });
    expect(decrypted).toEqual(plaintext);
  });

  it('detects tampering', async () => {
    const keyBytes = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
    const key = brandSymmetricKey(new Uint8Array(keyBytes));
    const nonce = await randomNonce();
    const plaintext = new TextEncoder().encode('tamper test');
    const ciphertext = await encrypt(key, plaintext, nonce);
    ciphertext[0] ^= 0xff;

    await expect(async () => {
      await decrypt(key, ciphertext, nonce);
    }).rejects.toThrow();
  });
});

