import { describe, expect, it, vi } from 'vitest';
import { createPostgresTokensRepository } from '../../../../adapters/postgres/tokensRepository';

const createPool = () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) });

describe('PostgresTokensRepository', () => {
  it('revokes token by id', async () => {
    const pool = createPool();
    const repo = createPostgresTokensRepository(pool as any);
    await repo.revoke('tok');
    expect(pool.query).toHaveBeenCalledWith('UPDATE auth.refresh_tokens SET revoked_at = now() WHERE id = $1', ['tok']);
  });

  it('revokes tokens for device only when not already revoked', async () => {
    const pool = createPool();
    const repo = createPostgresTokensRepository(pool as any);
    await repo.revokeAllForDevice('dev');
    expect(pool.query).toHaveBeenCalledWith('UPDATE auth.refresh_tokens SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL', ['dev']);
  });
});

