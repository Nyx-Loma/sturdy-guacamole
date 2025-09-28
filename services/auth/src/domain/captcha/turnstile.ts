import { createHash } from 'node:crypto';
import type { Config } from '../../config';
import { InvalidSignatureError } from '../errors';
import type {
  CaptchaVerifier,
  CaptchaVerificationInput,
  CaptchaVerificationResult
} from './types';

interface TurnstileSiteVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  error_codes?: string[];
  action?: string;
  cdata?: string;
  score?: number;
}

const TURNSTILE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const hashToken = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 8);

export interface TurnstileVerifierOptions {
  fetchImpl?: typeof fetch;
  logger?: { debug: (obj: object, msg?: string) => void; warn: (obj: object, msg?: string) => void };
}

export const createTurnstileVerifier = (
  config: Config,
  { fetchImpl = fetch, logger }: TurnstileVerifierOptions = {}
): CaptchaVerifier => {
  if (!config.TURNSTILE_SECRET) {
    throw new InvalidSignatureError('turnstile secret missing');
  }

  return {
    async verify({ token, remoteIp, action }: CaptchaVerificationInput): Promise<CaptchaVerificationResult> {
      if (!token) {
        return { provider: 'turnstile', verdict: 'deny' };
      }

      const body = new URLSearchParams();
      body.set('secret', config.TURNSTILE_SECRET ?? '');
      body.set('response', token);
      if (remoteIp) {
        body.set('remoteip', remoteIp);
      }

      let response: Response;
      try {
        response = await fetchImpl(TURNSTILE_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body
        });
      } catch (error) {
        logger?.warn({ error, token: hashToken(token) }, 'captcha fetch failed');
        return { provider: 'turnstile', verdict: 'deny' };
      }

      if (!response.ok) {
        logger?.warn({ status: response.status, token: hashToken(token) }, 'captcha gateway error');
        return { provider: 'turnstile', verdict: 'deny' };
      }

      let payload: TurnstileSiteVerifyResponse;
      try {
        payload = (await response.json()) as TurnstileSiteVerifyResponse;
      } catch (error) {
        logger?.warn({ error, token: hashToken(token) }, 'captcha json parse failed');
        return { provider: 'turnstile', verdict: 'deny' };
      }

      const score = payload.score ?? 0;
      const matchedAction = !action || !payload.action || action === payload.action;
      const allowedAction = matchedAction || config.CAPTCHA_REQUIRED_ACTIONS.length === 0;
      const meetsScore = score >= config.CAPTCHA_MIN_SCORE;

      const verdict: CaptchaVerificationResult['verdict'] = payload.success && allowedAction && meetsScore ? 'allow' : 'deny';

      logger?.debug(
        {
          token: hashToken(token),
          verdict,
          score,
          action: payload.action
        },
        'captcha verification'
      );

      return {
        provider: 'turnstile',
        verdict,
        score,
        action: payload.action,
        ts: payload.challenge_ts
      };
    }
  };
};

