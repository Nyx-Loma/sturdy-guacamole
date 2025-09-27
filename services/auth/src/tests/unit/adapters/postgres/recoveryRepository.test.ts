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

  it('returns blob when present', async () => {
    const blob = {
      id: 'b1', account_id: 'acc', blob_version: 1, ciphertext: Buffer.from([]), nonce: Buffer.from([]), associated_data: Buffer.from([]),
      salt: Buffer.from([]), argon_params: { timeCost: 1, memoryCost: 1, parallelism: 1 }, profile: 'desktop', cipher_length: 1, pad_length: 0,
      verifier: null, kek_verifier: null, is_active: true, created_at: new Date(), updated_at: new Date(), deleted_at: null, previous_blob_id: null, size_bytes: null
    };
    const pool = { query: vi.fn().mockResolvedValue({ rows: [blob] }) } as any;
    const repo = createPostgresRecoveryRepository(pool);
    const result = await repo.getActiveBlob('acc');
    expect(result?.id).toBe('b1');
  });
});

