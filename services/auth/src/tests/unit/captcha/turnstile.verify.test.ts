import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTurnstileVerifier } from '../../../domain/captcha/turnstile';
import { loadConfig, resetConfigForTests } from '../../../config';

describe('turnstile verifier', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetConfigForTests();
    (global as any).fetch = fetchMock;
    fetchMock.mockReset();
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.TURNSTILE_SECRET = 'secret';
    delete process.env.CAPTCHA_REQUIRED_ACTIONS;
    delete process.env.CAPTCHA_MIN_SCORE;
  });

  it('allows when score >= threshold and action matches', async () => {
    const verifier = createTurnstileVerifier(loadConfig());
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, score: 0.9, action: 'login' }),
        { status: 200 }
      )
    );
    const result = await verifier.verify({ token: 't', action: 'login', ip: '1.2.3.4' });
    expect(result.verdict).toBe('allow');
    expect(result.provider).toBe('turnstile');
  });

  it('denies on low score', async () => {
    process.env.CAPTCHA_MIN_SCORE = '0.95';
    const verifier = createTurnstileVerifier(loadConfig());
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, score: 0.9, action: 'login' }),
        { status: 200 }
      )
    );
    const result = await verifier.verify({ token: 't', action: 'login' });
    expect(result.verdict).toBe('deny');
  });

  it('denies when required action does not match', async () => {
    process.env.CAPTCHA_REQUIRED_ACTIONS = 'signup, purchase';
    const verifier = createTurnstileVerifier(loadConfig());
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, score: 0.99, action: 'signup' }),
        { status: 200 }
      )
    );
    const result = await verifier.verify({ token: 't', action: 'login' });
    expect(result.verdict).toBe('deny');
  });

  it('denies when HTTP status not 200', async () => {
    const verifier = createTurnstileVerifier(loadConfig());
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    const result = await verifier.verify({ token: 't' });
    expect(result.verdict).toBe('deny');
  });

  it('denies when response is not JSON', async () => {
    const verifier = createTurnstileVerifier(loadConfig());
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('bad'); } } as any);
    const result = await verifier.verify({ token: 't' });
    expect(result.verdict).toBe('deny');
  });
});


