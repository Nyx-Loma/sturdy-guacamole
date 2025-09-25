import { describe, expect, it, beforeAll } from 'vitest';
import { generateSigningKeyPair, sign, verify } from '../src/asymmetric';
import { ensureSodium } from '../src/sodium/init';

beforeAll(async () => {
  await ensureSodium();
});

describe('asymmetric signatures', () => {
  it('signs and verifies messages', async () => {
    const { publicKey, secretKey } = await generateSigningKeyPair();
    const message = new TextEncoder().encode('hello');
    const signature = await sign(message, secretKey);
    const valid = await verify(message, signature, publicKey);
    expect(valid).toBe(true);
  });

  it('rejects tampered messages', async () => {
    const { publicKey, secretKey } = await generateSigningKeyPair();
    const message = new TextEncoder().encode('hello');
    const signature = await sign(message, secretKey);
    const tampered = new TextEncoder().encode('hello!');
    const valid = await verify(tampered, signature, publicKey);
    expect(valid).toBe(false);
  });
});

