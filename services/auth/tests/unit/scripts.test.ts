import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPools: any[] = [];

vi.mock('pg', () => {
  class MockPool {
    __client = { query: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
    connect = vi.fn().mockResolvedValue(this.__client);
    end = vi.fn().mockResolvedValue(undefined);
    constructor() {
      mockPools.push(this);
    }
  }
  return { Pool: MockPool };
});

vi.mock('node:fs/promises', async (original) => {
  const actual = await original();
  return {
    ...actual,
    readFile: vi.fn().mockResolvedValue('SELECT 1;')
  };
});

describe('scripts/migrate runMigrations', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('skips when STORAGE_DRIVER is not postgres', async () => {
    process.env.STORAGE_DRIVER = 'memory';
    const module = await import('../../scripts/migrate');
    const runMigrations = module.runMigrations ?? module.migrate ?? module.default;
    await expect(runMigrations()).resolves.toBeUndefined();
  });

  it('throws when postgres driver but url missing', async () => {
    process.env.STORAGE_DRIVER = 'postgres';
    delete process.env.POSTGRES_URL;
    const module = await import('../../scripts/migrate');
    const runMigrations = module.runMigrations ?? module.migrate ?? module.default;
    await expect(runMigrations()).rejects.toSatisfy((error: unknown) => {
      if (Array.isArray(error)) {
        return error.some((issue) => issue.path?.[0] === 'POSTGRES_URL');
      }
      if (error && typeof error === 'object' && 'issues' in (error as any)) {
        return (error as { issues: Array<{ path: unknown[] }> }).issues.some((issue) => issue.path?.[0] === 'POSTGRES_URL');
      }
      if (error instanceof Error) {
        return error.message.includes('POSTGRES_URL');
      }
      return false;
    });
  });

  it('applies migrations when configured for postgres', async () => {
    process.env.STORAGE_DRIVER = 'postgres';
    process.env.POSTGRES_URL = 'postgres://localhost/test';
    const module = await import('../../scripts/migrate');
    const runMigrations = module.runMigrations ?? module.migrate ?? module.default;
    await runMigrations();
    const instance = mockPools.at(-1);
    expect(instance?.connect).toHaveBeenCalled();
    expect(instance?.__client.query).toHaveBeenCalled();
    expect(instance?.end).toHaveBeenCalled();
  });
});
