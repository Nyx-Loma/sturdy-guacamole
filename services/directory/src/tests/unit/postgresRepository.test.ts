import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPostgresDirectoryRepository, runMigrations } from '../../repositories/postgresRepository';

vi.mock('pg', () => {
  const query = vi.fn(async () => ({ rows: [{
    account_id: '11111111-1111-1111-1111-111111111111',
    display_name: 'Alice',
    public_key: 'pk',
    device_count: 2,
    updated_at: new Date('2025-01-01T00:00:00Z'),
    hashed_email: 'abcd'
  }] }));
  const end = vi.fn(async () => {});
  const Pool = vi.fn(() => ({ query, end }));
  return { Pool };
});

describe('postgres directory repository', () => {
  beforeEach(() => {
    process.env.POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';
  });

  it('runMigrations executes SQL without error', async () => {
    await expect(runMigrations()).resolves.not.toThrow();
  });

  it('maps rows from finders', async () => {
    const repo = createPostgresDirectoryRepository();
    const byId = await repo.findByAccountId('11111111-1111-1111-1111-111111111111');
    expect(byId?.displayName).toBe('Alice');
    const byHash = await repo.findByHashedEmail('ABCD');
    expect(byHash?.hashedEmail).toBe('abcd');
  });
});
