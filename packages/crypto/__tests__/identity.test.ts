import { describe, expect, it } from 'vitest';
import { createIdentity, serializeIdentity, deserializeIdentity } from '../src/identity/identity';

const toBuffer = (input: string) => Buffer.from(input, 'base64url');

describe('identity', () => {
  it('round-trips identity serialization', async () => {
    const identity = await createIdentity();
    const serialized = serializeIdentity(identity);
    expect(serialized).toMatchObject({ v: 1, publicKey: expect.any(String), secretKey: expect.any(String) });

    const deserialized = deserializeIdentity(serialized);
    expect(Buffer.from(deserialized.publicKey)).toEqual(Buffer.from(identity.publicKey));
    expect(Buffer.from(deserialized.secretKey)).toEqual(Buffer.from(identity.secretKey));
  });

  it('rejects unsupported versions', () => {
    expect(() => deserializeIdentity({ v: 2, publicKey: '', secretKey: '' })).toThrow('unsupported identity version');
  });

  it('encodes base64url strings', async () => {
    const identity = await createIdentity();
    const { publicKey, secretKey } = serializeIdentity(identity);
    expect(() => toBuffer(publicKey)).not.toThrow();
    expect(() => toBuffer(secretKey)).not.toThrow();
  });
});
