import { describe, expect, it, vi, afterEach } from 'vitest';
import { getPool, closePool } from '../../../../adapters/postgres/pool';

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({ end: vi.fn().mockResolvedValue(undefined) }))
}));

afterEach(async () => {
  await closePool();
  vi.clearAllMocks();
});

describe('postgres pool helpers', () => {
  it('creates singleton pool when config valid', () => {
    const config = { STORAGE_DRIVER: 'postgres', POSTGRES_URL: 'postgres://localhost' } as any;
    const first = getPool(config);
    const second = getPool(config);
    expect(first).toBe(second);
  });

  it('throws when storage driver not postgres', () => {
    const config = { STORAGE_DRIVER: 'memory' } as any;
    expect(() => getPool(config)).toThrow('postgres pool requested but STORAGE_DRIVER is not postgres');
  });

  it('closes pool and resets singleton', async () => {
    const config = { STORAGE_DRIVER: 'postgres', POSTGRES_URL: 'postgres://localhost' } as any;
    const pool = getPool(config);
    await closePool();
    expect(pool.end).toHaveBeenCalled();
    const newPool = getPool(config);
    expect(newPool).not.toBe(pool);
  });
});

