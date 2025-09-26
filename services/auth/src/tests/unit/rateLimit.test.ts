import { describe, expect, it } from 'vitest';
import { loadConfig, resetConfigForTests } from '../../config';
import { createDeviceService } from '../../domain/services/deviceService';
import { createInMemoryDevicesRepository } from '../../adapters/inMemory/devicesRepository';
import { RateLimitError } from '../../domain/errors';

describe('device limit enforcement', () => {
  const setup = (limit: number) => {
    resetConfigForTests();
    process.env.DEVICE_MAX_PER_ACCOUNT = String(limit);
    const config = loadConfig();
    const repo = createInMemoryDevicesRepository();
    const service = createDeviceService(repo, config.DEVICE_MAX_PER_ACCOUNT);
    return { service, repo };
  };

  it('allows registrations under limit', async () => {
    const { service } = setup(3);
    const accountId = 'acc';
    await expect(service.register(accountId, 'a')).resolves.toBeDefined();
    await expect(service.register(accountId, 'b')).resolves.toBeDefined();
  });

  it('throws when exceeding device limit', async () => {
    const { service } = setup(2);
    const accountId = 'acc';
    await service.register(accountId, 'a');
    await service.register(accountId, 'b');
    await expect(service.register(accountId, 'c')).rejects.toThrow(RateLimitError);
  });

  it('only counts active devices towards limit', async () => {
    const { service, repo } = setup(1);
    const accountId = 'acc';
    const device = await service.register(accountId, 'a');
    await repo.update(device.id, { status: 'revoked' as const });
    await expect(service.register(accountId, 'b')).resolves.toBeDefined();
  });
});


