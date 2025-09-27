import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createTurnstileVerifier } from '../../domain/captcha/turnstile';
import { loadConfig, resetConfigForTests } from '../../config';
import { AuthMetrics } from '../../domain/metrics';

const buildConfig = () => {
  resetConfigForTests();
  process.env.TURNSTILE_SECRET = 'secret';
  return loadConfig();
};

describe('TurnstileVerifier', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false and records deny when API says failure', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false, "error-codes": ['timeout-or-duplicate'] }))) as any;
    const metrics = new AuthMetrics();
    const verifier = createTurnstileVerifier(buildConfig(), { fetchImpl: fetch });
    const result = await verifier.verify({ token: 'token', action: 'login' });
    expect(result.verdict).toBe('deny');
    expect(metrics.getCaptchaCount('deny', 'turnstile')).toBe(0);
  });

  it('returns deny when fetch rejects', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); }) as any;
    const verifier = createTurnstileVerifier(buildConfig(), { fetchImpl: fetch });
    const result = await verifier.verify({ token: 'token', action: 'login' });
    expect(result.verdict).toBe('deny');
  });

  it('denies low score payloads even when success true', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, score: 0.1, action: 'login' })));
    const verifier = createTurnstileVerifier(buildConfig(), { fetchImpl: fetchMock });
    const result = await verifier.verify({ token: 'token', action: 'login' });
    expect(result.verdict).toBe('deny');
  });

  it('logs warnings when fetch throws', async () => {
    const warn = vi.fn();
    const verifier = createTurnstileVerifier(buildConfig(), {
      fetchImpl: vi.fn(async () => { throw new Error('network'); }) as any,
      logger: { debug: vi.fn(), warn }
    });
    const result = await verifier.verify({ token: 'token', action: 'login' });
    expect(result.verdict).toBe('deny');
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ token: expect.any(String) }), 'captcha fetch failed');
  });
});
