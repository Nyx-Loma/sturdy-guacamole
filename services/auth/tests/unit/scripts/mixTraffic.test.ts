import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const fetchMock = vi.fn();
const exitMock = vi.spyOn(process, 'exit');

describe('mixTraffic script', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('console', { log: vi.fn(), error: vi.fn() });
    vi.stubGlobal('Math', { random: () => 0.1 });
    process.env.LOAD_DURATION_MS = '1';
    process.env.LOAD_CONCURRENCY = '1';
    process.env.BASE_URL = 'http://localhost:8081';
    exitMock.mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LOAD_DURATION_MS;
    delete process.env.LOAD_CONCURRENCY;
    delete process.env.BASE_URL;
    fetchMock.mockReset();
    exitMock.mockReset();
  });

  it('executes with mocked fetch', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ account_id: 'acc', device_id: 'dev' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ nonce: 'nonce' }) });

    await import('../../load/mixTraffic');
    expect(fetchMock).toHaveBeenCalled();
    expect(exitMock).not.toHaveBeenCalled();
  });
});

