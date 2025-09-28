import { describe, it, expect, vi } from 'vitest';
import { createPostgresTokensRepository } from '../../../../adapters/postgres/tokensRepository';

const makePool = () => ({ query: vi.fn() });

describe('postgres tokens repository extra', () => {
  it('findById returns null when no rows', async () => {
    const pool = makePool();
    (pool.query as any).mockResolvedValue({ rows: [] });
    const repo = createPostgresTokensRepository(pool as any);
    const result = await repo.findById('missing');
    expect(result).toBeNull();
  });

  it('revoke methods execute expected queries', async () => {
    const pool = makePool();
    (pool.query as any).mockResolvedValue({});
    const repo = createPostgresTokensRepository(pool as any);
    await repo.revoke('id');
    await repo.revokeAllForDevice('device');
    await repo.revokeAllForAccount('account');
    expect(pool.query).toHaveBeenCalledWith('UPDATE auth.refresh_tokens SET revoked_at = now() WHERE id = $1', ['id']);
    expect(pool.query).toHaveBeenCalledWith('UPDATE auth.refresh_tokens SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL', ['device']);
    expect(pool.query).toHaveBeenCalledWith('UPDATE auth.refresh_tokens SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL', ['account']);
  });
});


