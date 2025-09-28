import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPostgresRecoveryRepository } from '../../../../adapters/postgres/recoveryRepository';

const pool = { query: vi.fn() } as any;

describe('PostgresRecoveryRepository more reads', () => {
  beforeEach(() => { (pool.query as any).mockReset(); });

  it('maps getActiveBlob with optional fields', async () => {
    (pool.query as any).mockResolvedValueOnce({ rows: [{
      id: 'id', account_id: 'acc', blob_version: 1,
      ciphertext: Buffer.from([1]), nonce: Buffer.from([2]), associated_data: Buffer.from([3]), salt: Buffer.from([4]),
      argon_params: { t: 1 }, profile: 'desktop', cipher_length: 1, pad_length: 0,
      verifier: null, kek_verifier: null, is_active: true,
      created_at: new Date(), updated_at: new Date(), deleted_at: null,
      previous_blob_id: null, size_bytes: null
    }] });
    const repo = createPostgresRecoveryRepository(pool);
    const record = await repo.getActiveBlob('acc');
    expect(record?.cipherLength).toBe(1);
    expect(record?.verifier).toBeNull();
    expect(record?.kekVerifier).toBeNull();
  });

  it('returns null when getBlobById not found', async () => {
    (pool.query as any).mockResolvedValueOnce({ rows: [] });
    const repo = createPostgresRecoveryRepository(pool);
    const record = await repo.getBlobById('missing');
    expect(record).toBeNull();
  });

  it('lists blobs', async () => {
    (pool.query as any).mockResolvedValueOnce({ rows: [{
      id: 'id', account_id: 'acc', blob_version: 1,
      ciphertext: Buffer.from([1]), nonce: Buffer.from([2]), associated_data: Buffer.from([3]), salt: Buffer.from([4]),
      argon_params: { t: 1 }, profile: 'desktop', cipher_length: 1, pad_length: 0,
      verifier: Buffer.from([5]), kek_verifier: Buffer.from([6]), is_active: false,
      created_at: new Date(), updated_at: new Date(), deleted_at: null,
      previous_blob_id: 'prev', size_bytes: 10
    }] });
    const repo = createPostgresRecoveryRepository(pool);
    const list = await repo.listBlobs('acc');
    expect(list).toHaveLength(1);
    expect(list[0].previousBlobId).toBe('prev');
  });

  it('deletes blob', async () => {
    (pool.query as any).mockResolvedValueOnce({});
    const repo = createPostgresRecoveryRepository(pool);
    await repo.deleteBlob('id');
    expect(pool.query).toHaveBeenCalledWith('DELETE FROM auth.recovery_blobs WHERE id = $1', ['id']);
  });
});


