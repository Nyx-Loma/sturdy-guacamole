import { describe, it, expect, vi } from 'vitest';
import { createPostgresAccountsRepository } from '../../../../adapters/postgres/accountsRepository';

const makePool = () => ({ query: vi.fn() });

describe('postgres accounts repository', () => {
  it('creates anonymous account and maps result', async () => {
    const pool = makePool();
    (pool.query as any).mockResolvedValue({ rows: [{ id: 'id', created_at: new Date('2025-01-01'), status: 'active' }] });
    const repo = createPostgresAccountsRepository(pool as any);
    const account = await repo.createAnonymous();
    expect(account).toMatchObject({ id: 'id', status: 'active' });
  });

  it('finds account by id or returns null', async () => {
    const pool = makePool();
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: 'id', created_at: new Date('2025-01-01'), status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] });
    const repo = createPostgresAccountsRepository(pool as any);
    const found = await repo.findById('id');
    expect(found?.id).toBe('id');
    const missing = await repo.findById('missing');
    expect(missing).toBeNull();
  });

  it('updates account status', async () => {
    const pool = makePool();
    (pool.query as any).mockResolvedValue({ rows: [] });
    const repo = createPostgresAccountsRepository(pool as any);
    await repo.updateStatus('id', 'suspended' as any);
    expect(pool.query).toHaveBeenCalledWith('UPDATE auth.accounts SET status = $2 WHERE id = $1', ['id', 'suspended']);
  });
});


