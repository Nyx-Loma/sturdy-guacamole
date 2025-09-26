import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createInMemoryPairingRepository } from '../../adapters/inMemory/pairingRepository';
import { createInMemoryAccountsRepository } from '../../adapters/inMemory/accountsRepository';
import { createInMemoryDevicesRepository } from '../../adapters/inMemory/devicesRepository';
import { initPairing } from '../../usecases/devices/pairing/initPairing';
import { completePairing } from '../../usecases/devices/pairing/completePairing';
import { approvePairing } from '../../usecases/devices/pairing/approvePairing';
import { createPairingService } from '../../domain/services/pairingService';
import { ExpiredPairingError } from '../../domain/errors';
import Redis from 'ioredis-mock';
import { createRedisPairingStore } from '../../adapters/redis/pairingStore';

const makeContainer = () => {
  const pairing = createInMemoryPairingRepository();
  const accounts = createInMemoryAccountsRepository();
  const devices = createInMemoryDevicesRepository();
  return {
    repos: { pairing, accounts, devices },
    services: {
      pairing: createPairingService(pairing, 1)
    },
    config: {
      PAIRING_TOKEN_TTL_SECONDS: 1,
      ACCESS_TOKEN_TTL_SECONDS: 300,
      REFRESH_TOKEN_TTL_MS: 1000 * 60 * 60,
      DEVICE_MAX_PER_ACCOUNT: 3,
      JWT_SECRET: 'secret',
      JWT_ISSUER: 'issuer',
      JWT_AUDIENCE: 'audience',
      STORAGE_DRIVER: 'memory'
    }
  } as any;
};

describe('pairing use cases', () => {
  it('completes and approves pairing', async () => {
    const ctx = makeContainer();
    const account = await ctx.repos.accounts.createAnonymous();
    const device = await ctx.repos.devices.create({
      accountId: account.id,
      publicKey: 'primary',
      status: 'active'
    } as any);

    const init = await initPairing(ctx, {
      accountId: account.id,
      primaryDeviceId: device.id
    });
    expect(init.token).toBeDefined();

    const completed = await completePairing(ctx, {
      pairingToken: init.token,
      newPublicKey: 'pubkey'
    });
    expect(completed.pendingPublicKey).toBe('pubkey');

    const approved = await approvePairing(ctx, { pairingToken: init.token });
    expect(approved.used).toBe(true);
  });

  it('rejects expired pairing', async () => {
    const ctx = makeContainer();
    const account = await ctx.repos.accounts.createAnonymous();
    const device = await ctx.repos.devices.create({
      accountId: account.id,
      publicKey: 'primary',
      status: 'active'
    } as any);

    const init = await initPairing(ctx, {
      accountId: account.id,
      primaryDeviceId: device.id
    });

    vi.useFakeTimers();
    vi.advanceTimersByTime(2000);

    await expect(
      completePairing(ctx, {
        pairingToken: init.token,
        newPublicKey: 'pubkey'
      })
    ).rejects.toThrow(ExpiredPairingError);

    vi.useRealTimers();
  });

  it('rejects reused pairing token', async () => {
    const ctx = makeContainer();
    const account = await ctx.repos.accounts.createAnonymous();
    const device = await ctx.repos.devices.create({
      accountId: account.id,
      publicKey: 'primary',
      status: 'active'
    } as any);

    const init = await initPairing(ctx, {
      accountId: account.id,
      primaryDeviceId: device.id
    });

    await completePairing(ctx, { pairingToken: init.token, newPublicKey: 'pubkey' });
    await approvePairing(ctx, { pairingToken: init.token });

    await expect(approvePairing(ctx, { pairingToken: init.token })).rejects.toThrow(ExpiredPairingError);
  });

  it('rejects when primary device signature invalid', async () => {
    const ctx = makeContainer();
    const account = await ctx.repos.accounts.createAnonymous();
    const device = await ctx.repos.devices.create({
      accountId: account.id,
      publicKey: 'primary',
      status: 'active'
    } as any);

    const init = await initPairing(ctx, {
      accountId: account.id,
      primaryDeviceId: device.id
    });

    await completePairing(ctx, { pairingToken: init.token, newPublicKey: 'pubkey' });

    await ctx.repos.pairing.update(init.token, {
      ...(await ctx.repos.pairing.findByToken(init.token)),
      pendingPublicKey: undefined
    });

    await expect(approvePairing(ctx, { pairingToken: init.token })).rejects.toThrow('pairing not completed by new device');
  });
});

describe('pairing service redis cache', () => {
  let redis: Redis;
  beforeEach(() => {
    redis = new Redis();
  });

  it('caches pairing metadata on init and drops on approve', async () => {
    const pairingRepo = createInMemoryPairingRepository();
    const cache = createRedisPairingStore(redis as any);
    const service = createPairingService(pairingRepo, 60, cache);

    const token = await service.init('acc', 'device', 'name');
    const cached = await cache.get(token.token);
    expect(cached).toMatchObject({ accountId: 'acc', primaryDeviceId: 'device' });

    await service.complete(token.token, 'pubkey');
    await service.approve(token.token);
    expect(await cache.get(token.token)).toBeNull();
  });
});


