import { describe, expect, it } from 'vitest';
import { createInMemoryDevicesRepository } from '../../adapters/inMemory/devicesRepository';

describe('inMemoryDevicesRepository', () => {
  it('creates devices with generated id', async () => {
    const repo = createInMemoryDevicesRepository();
    const device = await repo.create({ accountId: 'acc', publicKey: 'pk', status: 'active' } as any);
    expect(device.id).toBeTypeOf('string');
    expect(device.status).toBe('active');
  });

  it('finds devices by id', async () => {
    const repo = createInMemoryDevicesRepository();
    const device = await repo.create({ accountId: 'acc', publicKey: 'pk', status: 'active' } as any);
    const fetched = await repo.findById(device.id);
    expect(fetched?.id).toBe(device.id);
  });

  it('lists devices by account', async () => {
    const repo = createInMemoryDevicesRepository();
    await repo.create({ accountId: 'acc', publicKey: 'pk', status: 'active' } as any);
    const devices = await repo.findByAccount('acc');
    expect(devices).toHaveLength(1);
  });

  it('updates device fields', async () => {
    const repo = createInMemoryDevicesRepository();
    const device = await repo.create({ accountId: 'acc', publicKey: 'pk', status: 'active' } as any);
    await repo.update(device.id, { status: 'revoked' });
    const updated = await repo.findById(device.id);
    expect(updated?.status).toBe('revoked');
  });

  it('counts active devices for account', async () => {
    const repo = createInMemoryDevicesRepository();
    await repo.create({ accountId: 'acc', publicKey: 'pk', status: 'active' } as any);
    const second = await repo.create({ accountId: 'acc', publicKey: 'pk2', status: 'active' } as any);
    await repo.update(second.id, { status: 'revoked' });
    const count = await repo.countActiveForAccount('acc');
    expect(count).toBe(1);
  });
});
