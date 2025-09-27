import { describe, expect, it, vi } from 'vitest';
import { createPostgresDevicesRepository } from '../../../../adapters/postgres/devicesRepository';

const createPool = () => ({
  query: vi.fn()
});

describe('PostgresDevicesRepository', () => {
  it('updates selected fields when patch provided', async () => {
    const pool = createPool();
    const repo = createPostgresDevicesRepository(pool as any);
    await repo.update('device', { displayName: 'desk', lastSeenAt: new Date('2025-01-01T00:00:00Z') });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE auth.devices SET'),
      expect.arrayContaining(['desk', expect.any(Date), 'device'])
    );
  });

  it('no-ops update when patch empty', async () => {
    const pool = createPool();
    const repo = createPostgresDevicesRepository(pool as any);
    await repo.update('device', {});
    expect(pool.query).not.toHaveBeenCalled();
  });
});

