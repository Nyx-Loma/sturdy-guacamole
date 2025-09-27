import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();

describe('loginBurst script', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('console', { log: vi.fn(), error: vi.fn() });
    process.env.LOAD_REQUESTS = '1';
    process.env.LOAD_CONCURRENCY = '1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LOAD_REQUESTS;
    delete process.env.LOAD_CONCURRENCY;
    fetchMock.mockReset();
  });

  it('runs with stubbed fetch responses', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ account_id: 'acc', device_id: 'dev' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nonce: 'nonce' }) })
      .mockResolvedValue({ ok: true, status: 200 });

    await import('../../load/loginBurst');
    expect(fetchMock).toHaveBeenCalled();
  });
});

