import { describe, expect, it } from 'vitest';
import { createInMemoryTokensRepository } from '../../adapters/inMemory/tokensRepository';

const baseToken = {
  id: 'token-1',
  accountId: 'acc',
  deviceId: 'device',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 1000)
};

describe('inMemoryTokensRepository', () => {
  it('creates and finds tokens', async () => {
    const repo = createInMemoryTokensRepository();
    await repo.create(baseToken);
    const fetched = await repo.findById('token-1');
    expect(fetched?.id).toBe('token-1');
  });

  it('marks tokens revoked', async () => {
    const repo = createInMemoryTokensRepository();
    await repo.create(baseToken);
    await repo.revoke('token-1');
    const fetched = await repo.findById('token-1');
    expect(fetched?.revokedAt).toBeInstanceOf(Date);
  });

  it('revokes all tokens for an account', async () => {
    const repo = createInMemoryTokensRepository();
    await repo.create(baseToken);
    await repo.create({ ...baseToken, id: 'token-2' });
    await repo.revokeAllForAccount('acc');
    const t1 = await repo.findById('token-1');
    const t2 = await repo.findById('token-2');
    expect(t1?.revokedAt).toBeInstanceOf(Date);
    expect(t2?.revokedAt).toBeInstanceOf(Date);
  });
});
