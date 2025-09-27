import { describe, expect, it, vi } from 'vitest';
import { createPairingService } from '../../domain/services/pairingService';
import { createInMemoryPairingRepository } from '../../adapters/inMemory/pairingRepository';
import { ExpiredPairingError, NotFoundError } from '../../domain/errors';

const ttlSeconds = 1;

describe('pairingService domain', () => {
  it('caches pairing tokens on init', async () => {
    const repo = createInMemoryPairingRepository();
    const cache = {
      cache: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      drop: vi.fn().mockResolvedValue(undefined)
    };
    const service = createPairingService(repo as any, ttlSeconds, cache);
    const token = await service.init('acc', 'dev');
    expect(cache.cache).toHaveBeenCalledWith(token.token, expect.objectContaining({ accountId: 'acc' }), ttlSeconds * 1000);
  });

  it('uses cache to drop on approve', async () => {
    const repo = createInMemoryPairingRepository();
    const cache = {
      cache: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      drop: vi.fn().mockResolvedValue(undefined)
    };
    const service = createPairingService(repo as any, ttlSeconds, cache);
    const token = await service.init('acc', 'dev');
    await service.complete(token.token, 'pk');
    await service.approve(token.token);
    expect(cache.drop).toHaveBeenCalledWith(token.token);
  });

  it('throws when approving without completion', async () => {
    const repo = createInMemoryPairingRepository();
    const service = createPairingService(repo as any, ttlSeconds);
    const token = await service.init('acc', 'dev');
    await expect(service.approve(token.token)).rejects.toThrow('pairing not completed by new device');
  });

  it('expires tokens based on ttl', async () => {
    const repo = createInMemoryPairingRepository();
    const service = createPairingService(repo as any, ttlSeconds);
    const token = await service.init('acc', 'dev');
    await service.complete(token.token, 'pk');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + ttlSeconds * 1000 + 1);
    await expect(service.complete(token.token, 'other')).rejects.toBeInstanceOf(ExpiredPairingError);
    await expect(service.approve(token.token)).rejects.toBeInstanceOf(ExpiredPairingError);
    vi.useRealTimers();
  });

  it('throws NotFound when token missing', async () => {
    const repo = createInMemoryPairingRepository();
    const service = createPairingService(repo as any, ttlSeconds);
    await expect(service.complete('missing', 'pk')).rejects.toBeInstanceOf(NotFoundError);
  });
});
