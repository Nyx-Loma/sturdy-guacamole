import { describe, expect, it, vi } from 'vitest';
import { createPostgresPairingRepository } from '../../../../adapters/postgres/pairingRepository';

const createPool = () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) });

describe('PostgresPairingRepository', () => {
  it('updates pairing token fields', async () => {
    const pool = createPool();
    const repo = createPostgresPairingRepository(pool as any);
    await repo.update('tok', { pendingPublicKey: 'pk', pendingDisplayName: 'Device' });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE auth.pairing_tokens'),
      ['tok', 'pk', 'Device']
    );
  });

  it('marks pairing as used', async () => {
    const pool = createPool();
    const repo = createPostgresPairingRepository(pool as any);
    await repo.markUsed('tok');
    expect(pool.query).toHaveBeenCalledWith('UPDATE auth.pairing_tokens SET used = true WHERE token = $1', ['tok']);
  });
});

