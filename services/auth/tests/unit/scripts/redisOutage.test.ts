import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const execMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('node:child_process', () => ({ exec: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => execMock }));

describe('redisOutage script', () => {
  beforeEach(() => {
    execMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ account_id: 'acc', device_id: 'dev', pairing_token: 'token' }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('console', { log: vi.fn(), error: vi.fn() });
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    process.env.BASE_URL = 'http://localhost:8081';
    process.env.COMPOSE_FILE = 'docker-compose.dev.yml';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    execMock.mockReset();
    fetchMock.mockReset();
    delete process.env.BASE_URL;
    delete process.env.COMPOSE_FILE;
  });

  it('runs redis outage chaos script', async () => {
    await import('../../chaos/redisOutage');
    expect(execMock).toHaveBeenCalled();
  });
});

