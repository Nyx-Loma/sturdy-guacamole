import { describe, expect, it, vi } from 'vitest';
import { createCryptoProvider } from '../src/provider';
import { brandCipherText, brandNonce, brandSymmetricKey } from '../src/types';

const plaintext = new Uint8Array([1, 2, 3]);
const key = brandSymmetricKey(new Uint8Array(32));
const nonce = brandNonce(new Uint8Array(24));

describe('crypto provider overrides', () => {
  it('uses randomBytes override', async () => {
    const override = vi.fn(async (len: number) => new Uint8Array(len).fill(7));
    const provider = createCryptoProvider({ randomBytes: override });
    const buf = await provider.randomBytes(5);
    expect(buf).toEqual(new Uint8Array([7, 7, 7, 7, 7]));
    expect(override).toHaveBeenCalledWith(5);
  });

  it('delegates encryption override and preserves ciphertext brand', async () => {
    const provider = createCryptoProvider({
      encrypt: async () => brandCipherText(new Uint8Array([9]))
    });
    const cipher = await provider.encrypt(key, plaintext, nonce);
    expect(cipher).toEqual(brandCipherText(new Uint8Array([9])));
  });

  it('delegates decrypt override', async () => {
    const provider = createCryptoProvider({
      decrypt: async () => ({ plaintext: new Uint8Array([4, 4]) })
    });
    const { plaintext: output } = await provider.decrypt(key, brandCipherText(new Uint8Array([0])), nonce);
    expect(output).toEqual(new Uint8Array([4, 4]));
  });

  it('delegates sign/verify overrides', async () => {
    const sign = vi.fn(async () => new Uint8Array([1]));
    const verify = vi.fn(async () => false);
    const provider = createCryptoProvider({ sign, verify });
    const signature = await provider.sign(key as any, plaintext);
    const result = await provider.verify(key as any, plaintext, signature as any);
    expect(signature).toEqual(new Uint8Array([1]));
    expect(result).toBe(false);
    expect(sign).toHaveBeenCalled();
    expect(verify).toHaveBeenCalled();
  });

  it('uses custom nonce generator', async () => {
    const nonceOverride = vi.fn(async () => brandNonce(new Uint8Array([5])));
    const provider = createCryptoProvider({ nonce: nonceOverride });
    const generated = await provider.nonce();
    expect(generated).toEqual(brandNonce(new Uint8Array([5])));
  });
});
