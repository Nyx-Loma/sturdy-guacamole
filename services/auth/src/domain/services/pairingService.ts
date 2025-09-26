import { randomUUID, randomBytes } from 'node:crypto';
import type { PairingRepository } from '../../repositories/pairingRepo';
import type { PairingToken } from '../entities/pairing';
import { ExpiredPairingError, NotFoundError } from '../errors';

export interface PairingCache {
  cache(token: string, record: { accountId: string; primaryDeviceId: string; nonce: string }, ttlMs: number): Promise<void>;
  get(token: string): Promise<{ accountId: string; primaryDeviceId: string; nonce: string } | null>;
  drop(token: string): Promise<void>;
}

export const createPairingService = (repo: PairingRepository, ttlSeconds: number, cache?: PairingCache) => {
  const init = async (accountId: string, primaryDeviceId: string, displayName?: string) => {
    const token: PairingToken = {
      token: randomUUID(),
      accountId,
      primaryDeviceId,
      nonce: randomBytes(32).toString('base64url'),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      pendingDisplayName: displayName,
      pendingPublicKey: undefined,
      used: false,
      usedAt: undefined
    };
    await repo.create(token);
    if (cache) {
      await cache.cache(token.token, { accountId, primaryDeviceId, nonce: token.nonce }, ttlSeconds * 1000);
    }
    return token;
  };
  const complete = async (tokenValue: string, publicKey: string) => {
    const token = await repo.findByToken(tokenValue);
    if (!token) throw new NotFoundError('pairing token not found');
    if (token.usedAt || token.expiresAt.getTime() < Date.now()) throw new ExpiredPairingError();
    const updated: PairingToken = { ...token, pendingPublicKey: publicKey };
    await repo.update(tokenValue, updated);
    return updated;
  };
  const approve = async (tokenValue: string) => {
    const token = await repo.findByToken(tokenValue);
    if (!token) throw new NotFoundError('pairing token not found');
    if (!token.pendingPublicKey) {
      throw new Error('pairing not completed by new device');
    }
    if (token.usedAt || token.expiresAt.getTime() < Date.now()) throw new ExpiredPairingError();
    const updated = { ...token, usedAt: new Date(), used: true };
    await repo.markUsed(tokenValue);
    if (cache) {
      await cache.drop(tokenValue);
    }
    return updated;
  };

  return { init, complete, approve };
};



