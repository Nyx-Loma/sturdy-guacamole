import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const execMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('node:child_process', () => ({ exec: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => execMock }));

describe('postgresOutage script', () => {
  beforeEach(() => {
    execMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ account_id: 'acc', device_id: 'dev' }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('console', { log: vi.fn(), error: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    execMock.mockReset();
    fetchMock.mockReset();
  });

  it('runs chaos script without throwing', async () => {
    await import('../../chaos/postgresOutage');
    expect(execMock).toHaveBeenCalled();
  });
});

