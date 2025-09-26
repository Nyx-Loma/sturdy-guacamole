import { Counter, Registry } from 'prom-client';

export type CaptchaResult = 'allow' | 'deny';

export class AuthMetrics {
  private readonly registry: Registry;
  private readonly captchaResults: Counter<string>;
  private readonly captchaCounts = new Map<string, number>();

  constructor(registry?: Registry) {
    this.registry = registry ?? new Registry();
    this.captchaResults = new Counter({
      name: 'auth_captcha_result_total',
      help: 'CAPTCHA verification verdicts',
      registers: [this.registry],
      labelNames: ['verdict', 'provider']
    });
  }

  recordCaptcha(verdict: CaptchaResult, provider: string) {
    this.captchaResults.labels(verdict, provider).inc();
    const key = this.key(verdict, provider);
    this.captchaCounts.set(key, (this.captchaCounts.get(key) ?? 0) + 1);
  }

  getRegistry() {
    return this.registry;
  }

  getCaptchaCounter() {
    return this.captchaResults;
  }

  getCaptchaCount(verdict: CaptchaResult, provider: string) {
    return this.captchaCounts.get(this.key(verdict, provider)) ?? 0;
  }

  private key(verdict: CaptchaResult, provider: string) {
    return `${verdict}:${provider}`;
  }
}
