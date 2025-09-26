import { describe, expect, it } from 'vitest';
import { createCryptoProvider } from '../src/provider';

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('chunk encryption skeleton', () => {
  it('detects tampered chunk', async () => {
    const provider = createCryptoProvider();
    const key = encode('0123456789abcdef0123456789abcdef');
    const nonce = encode('0123456789abcdef01234567');
    const plaintext = encode('chunk-data');

    const cipher = await provider.encrypt(key, plaintext, nonce);
    cipher[0] ^= 0xff;

    await expect(provider.decrypt(key, cipher, nonce)).rejects.toThrow();
  });

  it('restores plaintext for non-tampered chunk', async () => {
    const provider = createCryptoProvider();
    const key = encode('fedcba9876543210fedcba9876543210');
    const nonce = encode('0123456789abcdef01234567');
    const plaintext = encode('chunk-data');

    const cipher = await provider.encrypt(key, plaintext, nonce);
    const { plaintext: decrypted } = await provider.decrypt(key, cipher, nonce);

    expect(decode(decrypted)).toBe('chunk-data');
  });
});


