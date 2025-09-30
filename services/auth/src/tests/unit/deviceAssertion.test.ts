import { describe, expect, it, beforeAll, vi } from 'vitest';
import { getPublicKey, sign, utils as edUtils, hashes } from '@noble/ed25519';
import { createHash, randomBytes } from 'node:crypto';
import { createDeviceAssertionService } from '../../domain/services/deviceAssertion';
import { createMemoryNonceStore } from '../../adapters/memoryNonceStore';

const hash512 = (message: Uint8Array) => {
  const digest = createHash('sha512').update(Buffer.from(message)).digest();
  return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
};

beforeAll(() => {
  hashes.sha512 = hash512;
  edUtils.sha512Sync = hash512;
  edUtils.sha512 = async (message: Uint8Array) => hash512(message);
});

describe('device assertion service', () => {
  it('accepts valid signature once', async () => {
    const store = createMemoryNonceStore();
    const service = createDeviceAssertionService(store, 5000);
    const privateKey = Uint8Array.from(randomBytes(32));
    const publicKey = await getPublicKey(privateKey);
    const deviceId = 'device-1';
    const nonce = await service.generateNonce(deviceId);
    const signature = await sign(Buffer.from(nonce), privateKey);

    const ok = await service.verify(publicKey, nonce, signature, deviceId);
    expect(ok).toBe(true);

    const replay = await service.verify(publicKey, nonce, signature, deviceId);
    expect(replay).toBe(false);
  });

  it('rejects invalid signature', async () => {
    const store = createMemoryNonceStore();
    const service = createDeviceAssertionService(store, 5000);
    const privateKey = Uint8Array.from(randomBytes(32));
    const wrongKey = Uint8Array.from(randomBytes(32));
    const publicKey = await getPublicKey(privateKey);
    const deviceId = 'device-2';
    const nonce = await service.generateNonce(deviceId);
    const wrongSignature = await sign(Buffer.from(nonce), wrongKey);

    const ok = await service.verify(publicKey, nonce, wrongSignature, deviceId);
    expect(ok).toBe(false);
  });

  it('rejects missing nonce', async () => {
    const store = createMemoryNonceStore();
    const service = createDeviceAssertionService(store, 5000);
    const privateKey = Uint8Array.from(randomBytes(32));
    const publicKey = await getPublicKey(privateKey);
    const nonce = 'non-existent';
    const signature = await sign(Buffer.from(nonce), privateKey);
    const ok = await service.verify(publicKey, nonce, signature, 'device-3');
    expect(ok).toBe(false);
  });

  it('rejects expired nonce', async () => {
    vi.useFakeTimers();
    const store = createMemoryNonceStore();
    const service = createDeviceAssertionService(store, 5);
    const privateKey = Uint8Array.from(randomBytes(32));
    const publicKey = await getPublicKey(privateKey);
    const deviceId = 'device-expire';
    const nonce = await service.generateNonce(deviceId);
    const signature = await sign(Buffer.from(nonce), privateKey);

    await vi.advanceTimersByTimeAsync(10);
    const ok = await service.verify(publicKey, nonce, signature, deviceId);
    expect(ok).toBe(false);
    vi.useRealTimers();
  });

  it('rejects nonce replay across devices', async () => {
    const store = createMemoryNonceStore();
    const service = createDeviceAssertionService(store, 5000);
    const privateKey = Uint8Array.from(randomBytes(32));
    const publicKey = await getPublicKey(privateKey);
    const nonce = await service.generateNonce('device-a');
    const signature = await sign(Buffer.from(nonce), privateKey);

    const verifyA = await service.verify(publicKey, nonce, signature, 'device-a');
    expect(verifyA).toBe(true);

    const verifyB = await service.verify(publicKey, nonce, signature, 'device-b');
    expect(verifyB).toBe(false);
  });
});


