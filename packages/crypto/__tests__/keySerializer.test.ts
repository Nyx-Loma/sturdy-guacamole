import { describe, expect, it } from 'vitest';
import { createKeySerializer } from '../src/keySerializer';
import { brandPublicKey, brandSecretKey, brandSignature } from '../src/types';

const encoder = createKeySerializer();

const samplePublic = brandPublicKey(new Uint8Array([1, 2, 3]));
const sampleSecret = brandSecretKey(new Uint8Array([4, 5, 6, 7]));
const sampleSignature = brandSignature(new Uint8Array([8, 9, 10]));

describe('keySerializer', () => {
  it('encodes and decodes public keys', () => {
    const encoded = encoder.encodePublicKey(samplePublic, 'base64');
    const decoded = encoder.decodePublicKey(encoded, 'base64');
    expect(decoded).instanceOf(Uint8Array);
    expect(Array.from(decoded)).toEqual(Array.from(samplePublic));
  });

  it('encodes and decodes secret keys', () => {
    const encoded = encoder.encodeSecretKey(sampleSecret, 'base64');
    const decoded = encoder.decodeSecretKey(encoded, 'base64');
    expect(Array.from(decoded)).toEqual(Array.from(sampleSecret));
  });

  it('encodes and decodes signatures', () => {
    const encoded = encoder.encodeSignature(sampleSignature, 'base64');
    const decoded = encoder.decodeSignature(encoded, 'base64');
    expect(Array.from(decoded)).toEqual(Array.from(sampleSignature));
  });

  it('throws on empty decode input', () => {
    expect(() => encoder.decodePublicKey('', 'base64')).toThrow('empty input');
  });
});
