import { describe, expect, it } from 'vitest';
import { createInMemoryAccountsRepository } from '../../adapters/inMemory/accountsRepository';

describe('inMemoryAccountsRepository', () => {
  it('creates anonymous accounts with active status', async () => {
    const repo = createInMemoryAccountsRepository();
    const account = await repo.createAnonymous();
    expect(account).toMatchObject({ status: 'active' });
    expect(account.id).toBeTypeOf('string');
  });

  it('finds existing accounts', async () => {
    const repo = createInMemoryAccountsRepository();
    const account = await repo.createAnonymous();
    const fetched = await repo.findById(account.id);
    expect(fetched?.id).toBe(account.id);
  });

  it('returns null for unknown account', async () => {
    const repo = createInMemoryAccountsRepository();
    const fetched = await repo.findById('missing');
    expect(fetched).toBeNull();
  });

  it('updates account status', async () => {
    const repo = createInMemoryAccountsRepository();
    const account = await repo.createAnonymous();
    await repo.updateStatus(account.id, 'suspended');
    const updated = await repo.findById(account.id);
    expect(updated?.status).toBe('suspended');
  });
});
