export type CaptchaProvider = 'none' | 'turnstile';

export type CaptchaVerdict = 'allow' | 'challenge' | 'deny';

export interface CaptchaVerificationResult {
  provider: CaptchaProvider;
  verdict: CaptchaVerdict;
  score?: number;
  action?: string;
  ts?: string;
}

export interface CaptchaVerificationInput {
  token?: string;
  remoteIp?: string;
  action?: string;
  accountId?: string;
  deviceId?: string;
}

export interface CaptchaVerifier {
  verify(input: CaptchaVerificationInput): Promise<CaptchaVerificationResult>;
}

export const noopVerifier: CaptchaVerifier = {
  async verify() {
    return { provider: 'none', verdict: 'allow' };
  }
};

