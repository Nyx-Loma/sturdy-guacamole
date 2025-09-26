import { describe, expect, it } from 'vitest';
import { hkdfExtract, hkdfExpand } from '../src/hkdf';

const encoder = new TextEncoder();

describe('HKDF primitives', () => {
  it('produces identical keys for same salt and info', async () => {
    const ikm = encoder.encode('input key material');
    const salt = encoder.encode('salt');
    const info = encoder.encode('context');

    const prk1 = await hkdfExtract(salt, ikm);
    const key1 = await hkdfExpand(prk1, info, 32);
    const prk2 = await hkdfExtract(salt, ikm);
    const key2 = await hkdfExpand(prk2, info, 32);

    expect(key1).toEqual(key2);
  });

  it('produces different keys for different info', async () => {
    const ikm = encoder.encode('input key material');
    const salt = encoder.encode('salt');
    const info1 = encoder.encode('context-1');
    const info2 = encoder.encode('context-2');

    const prk = await hkdfExtract(salt, ikm);
    const key1 = await hkdfExpand(prk, info1, 32);
    const key2 = await hkdfExpand(prk, info2, 32);

    expect(key1).not.toEqual(key2);
  });

  it('throws if expansion exceeds limit', async () => {
    const ikm = encoder.encode('input');
    const prk = await hkdfExtract(undefined, ikm);
    await expect(hkdfExpand(prk, encoder.encode('info'), 32 * 256)).rejects.toThrow('hkdf expand too large');
  });
});


