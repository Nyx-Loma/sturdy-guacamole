import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { loadConfig, resetConfigForTests } from '../../config';
import { createTurnstileVerifier } from '../../domain/captcha/turnstile';
import { AuthMetrics } from '../../domain/metrics';

const makeResponse = (body: unknown, ok = true, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

describe('turnstile verifier', () => {
  beforeEach(() => {
    resetConfigForTests();
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.TURNSTILE_SECRET = 'secret';
  });

  it('returns allow for successful verification meeting score', async () => {
    const config = loadConfig();
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({ success: true, score: 0.9, action: 'login', challenge_ts: 'now' })
    );
    const verifier = createTurnstileVerifier(config, { fetchImpl });
    const result = await verifier.verify({ token: 'token', action: 'login' });
    expect(result.verdict).toBe('allow');
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('returns deny when score below threshold', async () => {
    process.env.CAPTCHA_MIN_SCORE = '0.8';
    const config = loadConfig();
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({ success: true, score: 0.2, action: 'login' })
    );
    const verifier = createTurnstileVerifier(config, { fetchImpl });
    const result = await verifier.verify({ token: 'token', action: 'login' });
    expect(result.verdict).toBe('deny');
  });

  it('denies when fetch fails and logs hashed token', async () => {
    const config = loadConfig();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'));
    const debug = vi.fn();
    const warn = vi.fn();
    const token = 'sensitive-token';
    const verifier = createTurnstileVerifier(config, { fetchImpl, logger: { debug, warn } });
    const result = await verifier.verify({ token });
    expect(result.verdict).toBe('deny');
    const expectedHash = createHash('sha256').update(token).digest('hex').slice(0, 8);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error), token: expectedHash }), 'captcha fetch failed');
    expect(debug).not.toHaveBeenCalled();
  });

  it('logs hashed token on successful verification', async () => {
    const config = loadConfig();
    const token = 'visible-token';
    const expectedHash = createHash('sha256').update(token).digest('hex').slice(0, 8);
    const debug = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({ success: true, score: 0.95, action: 'login' })
    );
    const verifier = createTurnstileVerifier(config, { fetchImpl, logger: { debug, warn: vi.fn() } });
    await verifier.verify({ token, action: 'login' });
    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({ token: expectedHash, verdict: 'allow', action: 'login' }),
      'captcha verification'
    );
  });
});
