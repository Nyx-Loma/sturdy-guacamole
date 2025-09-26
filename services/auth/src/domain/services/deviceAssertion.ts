import { verify as verifySignature } from '@noble/ed25519';
import { randomBytes } from 'node:crypto';

export interface NonceStore {
  issue(deviceId: string, nonce: string, ttlMs: number): Promise<void>;
  consume(deviceId: string, nonce: string): Promise<boolean>;
}

export const createDeviceAssertionService = (store: NonceStore, ttlMs = 60_000) => {
  const generateNonce = async (deviceId: string) => {
    const nonce = randomBytes(32).toString('base64url');
    await store.issue(deviceId, nonce, ttlMs);
    return nonce;
  };

  const verify = async (publicKey: Uint8Array, nonce: string, signature: Uint8Array, deviceId: string) => {
    const issued = await store.consume(deviceId, nonce);
    if (!issued) return false;
    const ok = await verifySignature(signature, Buffer.from(nonce), publicKey);
    return ok;
  };

  return { generateNonce, verify };
};


