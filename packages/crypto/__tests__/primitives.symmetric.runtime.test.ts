import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/sodium/init', async () => ({
  ensureSodium: vi.fn()
}));

const sodiumModule = await import('../src/sodium/init');
const { ensureSodium } = sodiumModule;
const sodiumMock = {
  crypto_aead_xchacha20poly1305_ietf_encrypt: vi.fn(),
  crypto_aead_xchacha20poly1305_ietf_decrypt: vi.fn(),
  randombytes_buf: vi.fn((len: number) => new Uint8Array(len).fill(9))
};

vi.mocked(ensureSodium).mockResolvedValue(sodiumMock as any);
const { encrypt, decrypt, randomNonce } = await import('../src/primitives/symmetric');

const key = (new Uint8Array(32).fill(7) as any);
const nonce = new Uint8Array(24).fill(8);
const plain = new Uint8Array([1, 2, 3]);
const additional = new Uint8Array([4, 5]);

sodiumMock.crypto_aead_xchacha20poly1305_ietf_encrypt.mockImplementation((plaintext: Uint8Array, ad: Uint8Array) => new Uint8Array([...plaintext, ...ad]));
sodiumMock.crypto_aead_xchacha20poly1305_ietf_decrypt.mockImplementation((_n: undefined, ciphertext: Uint8Array, ad: Uint8Array) => new Uint8Array(ciphertext.slice(0, ciphertext.length - ad.length)));

describe('primitives/symmetric', () => {
  it('honors additional data during encrypt/decrypt', async () => {
    const ciphertext = await encrypt(key, plain, nonce, { additionalData: additional });
    const plaintext = await decrypt(key, ciphertext, nonce, { additionalData: additional });
    expect(plaintext).toEqual(plain);
  });

  it('randomNonce uses sodium RNG', async () => {
    const result = await randomNonce();
    expect(result).toEqual(new Uint8Array(24).fill(9));
  });
});
