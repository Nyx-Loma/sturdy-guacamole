import { describe, expect, it, vi } from 'vitest';
import { createCryptoProvider } from '../src/provider';
import type { SymmetricKey } from '../src/types';

const sampleKey = new Uint8Array(32).fill(1) as SymmetricKey;
const sampleNonce = new Uint8Array(24).fill(2);
const payload = new Uint8Array([1, 2, 3]);

describe('crypto provider overrides', () => {
  it('falls back to overrides for encryption/decryption', async () => {
    const encrypt = vi.fn().mockResolvedValue(new Uint8Array([9]));
    const decrypt = vi.fn().mockResolvedValue({ plaintext: payload });
    const provider = createCryptoProvider({ encrypt, decrypt });

    const cipher = await provider.encrypt(sampleKey, payload, sampleNonce);
    const { plaintext } = await provider.decrypt(sampleKey, cipher, sampleNonce);

    expect(encrypt).toHaveBeenCalled();
    expect(decrypt).toHaveBeenCalled();
    expect(plaintext).toEqual(payload);
  });

  it('propagates errors from override', async () => {
    const provider = createCryptoProvider({
      decrypt: async () => {
        throw new Error('override failed');
      }
    });
    await expect(provider.decrypt(sampleKey, payload, sampleNonce)).rejects.toThrow('override failed');
  });

  it('uses custom nonce factory when provided', async () => {
    const nonce = new Uint8Array([7, 7, 7]);
    const factory = vi.fn().mockResolvedValue(nonce);
    const provider = createCryptoProvider({ nonce: factory });
    const generated = await provider.nonce();
    expect(generated).toEqual(nonce);
    expect(factory).toHaveBeenCalled();
  });
});
