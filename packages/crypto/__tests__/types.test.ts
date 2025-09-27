import { describe, expect, it } from 'vitest';
import {
  brandCipherText,
  brandNonce,
  brandPublicKey,
  brandSecretKey,
  brandSignature,
  brandSymmetricKey,
  assertLength
} from '../src/types';

describe('types branding', () => {
  it('brands byte arrays without mutation', () => {
    const source = new Uint8Array([1, 2, 3]);
    expect(brandPublicKey(source)).toBeInstanceOf(Uint8Array);
    expect(brandSecretKey(source)).toBeInstanceOf(Uint8Array);
    expect(brandSymmetricKey(source)).toBeInstanceOf(Uint8Array);
    expect(brandNonce(source)).toBeInstanceOf(Uint8Array);
    expect(brandCipherText(source)).toBeInstanceOf(Uint8Array);
    expect(brandSignature(source)).toBeInstanceOf(Uint8Array);
  });

  it('assertLength succeeds when length matches', () => {
    const buf = new Uint8Array(3);
    expect(() => assertLength(buf, 3, 'key')).not.toThrow();
  });

  it('assertLength throws when length mismatches', () => {
    const buf = new Uint8Array(2);
    expect(() => assertLength(buf, 3, 'key')).toThrow('key must be 3 bytes, got 2');
  });
});
