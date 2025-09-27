import { describe, expect, it } from 'vitest';
import { createInMemoryPairingRepository } from '../../adapters/inMemory/pairingRepository';

const baseToken = {
  token: 'pair-1',
  accountId: 'acc',
  primaryDeviceId: 'device-1',
  nonce: 'nonce',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 1000),
  used: false
};

describe('inMemoryPairingRepository', () => {
  it('creates token records', async () => {
    const repo = createInMemoryPairingRepository();
    const record = await repo.create(baseToken);
    expect(record.token).toBe('pair-1');
  });

  it('finds token by id', async () => {
    const repo = createInMemoryPairingRepository();
    await repo.create(baseToken);
    const fetched = await repo.findByToken('pair-1');
    expect(fetched?.token).toBe('pair-1');
  });

  it('updates token records', async () => {
    const repo = createInMemoryPairingRepository();
    await repo.create(baseToken);
    await repo.update('pair-1', { used: true });
    const updated = await repo.findByToken('pair-1');
    expect(updated?.used).toBe(true);
  });

  it('marks token used', async () => {
    const repo = createInMemoryPairingRepository();
    await repo.create(baseToken);
    await repo.markUsed('pair-1');
    const updated = await repo.findByToken('pair-1');
    expect(updated?.used).toBe(true);
  });
});
