import type { Config } from '../../config';
import type { CaptchaProvider, CaptchaVerificationInput, CaptchaVerifier } from './types';
import { noopVerifier } from './types';
import { createTurnstileVerifier } from './turnstile';
import { AuthMetrics } from '../metrics';

let sharedMetrics: AuthMetrics | undefined;

export interface CaptchaService {
  provider: CaptchaProvider;
  verify(input: CaptchaVerificationInput): Promise<boolean>;
  metrics: AuthMetrics;
}

export interface CaptchaServiceOptions {
  verifier?: CaptchaVerifier;
  metrics?: AuthMetrics;
}

export const createCaptchaService = (config: Config, options: CaptchaServiceOptions = {}): CaptchaService => {
  const metrics = options.metrics ?? (sharedMetrics ??= new AuthMetrics());
  const verifier =
    options.verifier ??
    (config.CAPTCHA_PROVIDER === 'turnstile'
      ? createTurnstileVerifier(config)
      : noopVerifier);

  const verify = async (input: CaptchaVerificationInput) => {
    if (config.CAPTCHA_PROVIDER === 'none') {
      return true;
    }

    if (config.CAPTCHA_BYPASS_SECRET && input.token === config.CAPTCHA_BYPASS_SECRET) {
      metrics.recordCaptcha('allow', config.CAPTCHA_PROVIDER);
      return true;
    }

    const result = await verifier.verify(input);
    metrics.recordCaptcha(result.verdict, result.provider);
    return result.verdict === 'allow';
  };

  return {
    provider: config.CAPTCHA_PROVIDER,
    verify,
    metrics
  };
};

