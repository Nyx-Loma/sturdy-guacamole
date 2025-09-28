import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetConfigForTests } from '../../config';

vi.mock('../../repositories/postgresRepository', () => {
  return {
    runMigrations: vi.fn(async () => {}),
    createPostgresDirectoryRepository: vi.fn(() => ({
      findByAccountId: async () => null,
      findByHashedEmail: async () => null
    }))
  };
});

describe('server wiring', () => {
  beforeEach(() => {
    delete process.env.STORAGE_DRIVER;
    resetConfigForTests();
  });

  it('wires memory repository by default', async () => {
    const { createServer } = await import('../../app/server');
    const server = createServer();
    await server.app.ready();
    expect(server.app.directoryService).toBeDefined();
  });

  it('wires postgres repository when configured', async () => {
    process.env.STORAGE_DRIVER = 'postgres';
    resetConfigForTests();
    const repoPg = await import('../../repositories/postgresRepository');
    const { createServer } = await import('../../app/server');
    const server = createServer();
    await server.app.ready();
    expect(server.app.directoryService).toBeDefined();
    expect(((repoPg as any).runMigrations as vi.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
