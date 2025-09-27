import { describe, expect, it } from 'vitest';
import type { KeyMaterial, SigningKeyRecord } from '../../domain/keys/types';

describe('key types sanity', () => {
  it('KeyMaterial structure matches expected fields', () => {
    const material: KeyMaterial = {
      kid: 'primary',
      secret: new Uint8Array([1, 2, 3]),
      notAfter: Date.now() + 1000,
      active: true,
      source: 'env'
    };
    expect(material.source).toBe('env');
    expect(material.secret).toBeInstanceOf(Uint8Array);
  });

  it('SigningKeyRecord supports optional metadata', () => {
    const record: SigningKeyRecord = {
      kid: 'secondary',
      material: 'encoded-key',
      encoding: 'base64url',
      notAfter: '2025-01-01T00:00:00Z',
      active: false
    };
    expect(record.encoding).toBe('base64url');
    expect(record.active).toBe(false);
  });
});
