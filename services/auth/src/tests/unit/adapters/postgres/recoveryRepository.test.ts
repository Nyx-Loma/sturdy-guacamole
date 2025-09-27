import { describe, expect, it, vi } from 'vitest';
import { createPostgresRecoveryRepository } from '../../../../adapters/postgres/recoveryRepository';

const createPool = () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) });

describe('PostgresRecoveryRepository', () => {
  it('upserts recovery record with conflicts handled', async () => {
    const pool = createPool();
    const repo = createPostgresRecoveryRepository(pool as any);
    await repo.upsert({ accountId: 'acc', rcHash: 'hash', params: { salt: 's' }, updatedAt: new Date() });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auth.recovery'), expect.arrayContaining(['acc', 'hash', { salt: 's' }]));
  });

  it('creates blob with defaults', async () => {
    const pool = createPool();
    const repo = createPostgresRecoveryRepository(pool as any);
    await repo.createBlob({
      id: 'blob',
      accountId: 'acc',
      blobVersion: 1,
      ciphertext: Buffer.alloc(0),
      nonce: Buffer.alloc(0),
      associatedData: Buffer.alloc(0),
      salt: Buffer.alloc(0),
      argonParams: { timeCost: 1, memoryCost: 1, parallelism: 1 },
      profile: 'desktop',
      cipherLength: 1,
      padLength: 0,
      isActive: true
    } as any);
    expect(pool.query.mock.calls[0][0]).toContain('INSERT INTO auth.recovery_blobs');
  });
});

