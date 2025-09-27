import { describe, expect, it } from 'vitest';
import * as Captcha from '../../../domain/captcha';

describe('captcha domain exports', () => {
  it('re-exports service factory', () => {
    expect(typeof Captcha.createCaptchaService).toBe('function');
  });

  it('re-exports turnstile verifier', () => {
    expect(typeof Captcha.createTurnstileVerifier).toBe('function');
  });
});
