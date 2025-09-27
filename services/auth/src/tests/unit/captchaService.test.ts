import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaptchaService } from '../../domain/captcha/service';
import { loadConfig, resetConfigForTests } from '../../config';
import { AuthMetrics } from '../../domain/metrics';

const resetEnv = () => {
  delete process.env.CAPTCHA_PROVIDER;
  delete process.env.TURNSTILE_SECRET;
  delete process.env.CAPTCHA_BYPASS_SECRET;
};

describe('captcha service', () => {
  beforeEach(() => {
    resetEnv();
    resetConfigForTests();
  });

  it('no-ops when provider is none', async () => {
    const config = loadConfig();
    const metrics = new AuthMetrics();
    const verify = vi.fn();
    const service = createCaptchaService(config, { verifier: { verify }, metrics });
    const allowed = await service.verify({ token: 'ignored' });
    expect(allowed).toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('records allow for bypass secret', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.TURNSTILE_SECRET = 'turn-secret';
    process.env.CAPTCHA_BYPASS_SECRET = 'bypass-token';
    const config = loadConfig();
    const metrics = new AuthMetrics();
    const verify = vi.fn().mockResolvedValue({ provider: 'turnstile', verdict: 'deny' });
    const service = createCaptchaService(config, { verifier: { verify }, metrics });
    const allowed = await service.verify({ token: 'bypass-token' });
    expect(allowed).toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(metrics.getCaptchaCount('allow', 'turnstile')).toBe(1);
    expect(metrics.getCaptchaCount('deny', 'turnstile')).toBe(0);
  });

  it('records provider verdicts from verifier', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.TURNSTILE_SECRET = 'turn-secret';
    const config = loadConfig();
    const metrics = new AuthMetrics();
    const allowVerifier = { verify: vi.fn().mockResolvedValue({ provider: 'turnstile', verdict: 'allow' }) };
    const denyVerifier = { verify: vi.fn().mockResolvedValue({ provider: 'turnstile', verdict: 'deny' }) };

    const allowService = createCaptchaService(config, { verifier: allowVerifier, metrics });
    await expect(allowService.verify({ token: 'token-1' })).resolves.toBe(true);

    const denyService = createCaptchaService(config, { verifier: denyVerifier, metrics });
    await expect(denyService.verify({ token: 'token-2' })).resolves.toBe(false);

    expect(metrics.getCaptchaCount('allow', 'turnstile')).toBe(1);
    expect(metrics.getCaptchaCount('deny', 'turnstile')).toBe(1);
  });

  it('reuses shared metrics when none provided', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.TURNSTILE_SECRET = 'turn-secret';
    const config = loadConfig();
    const serviceA = createCaptchaService(config);
    const serviceB = createCaptchaService(config);
    expect(serviceA.metrics).toBe(serviceB.metrics);
  });
});


