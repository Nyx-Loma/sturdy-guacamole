import { decodeProtectedHeader, errors as joseErrors, SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import type { Config } from '../../config';
import { ExpiredTokenError, InvalidSignatureError } from '../errors';
import type { KeyResolver } from '../keys';

const JTI_TTL_MS = 5 * 60 * 1000;

export interface TokenServiceOptions {
  config: Config;
  keyResolver: KeyResolver;
  leewaySeconds?: number;
}

export interface IssueAccessParams {
  accountId: string;
  deviceId: string;
  kid?: string;
}

export interface AccessTokenPayload {
  sub: string;
  did: string;
  ver: number;
  jti: string;
}

export const createTokenService = ({ config, keyResolver, leewaySeconds = config.JWT_ROTATION_LEEWAY_SECONDS }: TokenServiceOptions) => {
  const jtiCache = new Map<string, number>();

  const issueAccessToken = async ({ accountId, deviceId, kid }: IssueAccessParams) => {
    const payload: AccessTokenPayload = { sub: accountId, did: deviceId, ver: 1, jti: randomUUID() };
    const { secret, kid: activeKid } = await keyResolver.getActiveSigningKey();
    const headerKid = kid ?? activeKid;
    return new SignJWT(payload)
      .setProtectedHeader({ alg: config.JWT_SIGNING_ALG, kid: headerKid })
      .setIssuedAt()
      .setIssuer(config.JWT_ISSUER)
      .setAudience(config.JWT_AUDIENCE)
      .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(secret);
  };

  const verifyAccessToken = async (token: string) => {
    const header = safeDecodeProtectedHeader(token);
    if (!header.kid) {
      throw new InvalidSignatureError('missing kid header');
    }
    const candidates = (await keyResolver.getVerificationKeys()).filter(({ kid }) => kid === header.kid);
    if (!candidates.length) {
      throw new InvalidSignatureError('unknown signing key');
    }

    const now = Date.now();

    let lastError: unknown;
    for (const { secret, kid, notAfter } of candidates) {
      try {
        if (notAfter && now > notAfter + leewaySeconds * 1000) {
          continue;
        }
        const { payload, protectedHeader } = await jwtVerify(token, secret, {
          issuer: config.JWT_ISSUER,
          audience: config.JWT_AUDIENCE,
          clockTolerance: `${leewaySeconds}s`
        });
        if (protectedHeader?.kid !== kid) {
          throw new InvalidSignatureError('unexpected kid');
        }

        pruneJtiCache(jtiCache, now);
        if (!trackJti(jtiCache, payload.jti, now)) {
          throw new InvalidSignatureError('replayed token identifier');
        }
        return payload as AccessTokenPayload & { exp: number; iat: number };
      } catch (error) {
        lastError = error;
        if (error instanceof joseErrors.JWTExpired) {
          throw new ExpiredTokenError('access token expired');
        }
        if (error instanceof InvalidSignatureError) {
          continue;
        }
        if (error instanceof Error && error.message?.includes('signature verification failed')) {
          continue;
        }
        throw new InvalidSignatureError('invalid access token');
      }
    }

    if (lastError instanceof InvalidSignatureError) {
      throw lastError;
    }

    throw new InvalidSignatureError('invalid access token');
  };

  const issueRefreshTokenId = () => randomUUID();

  const revokeAllForAccount = async (tokensRepo: { revokeAllForAccount: (accountId: string) => Promise<void> }, accountId: string) => {
    await tokensRepo.revokeAllForAccount(accountId);
  };

  return {
    issueAccessToken,
    verifyAccessToken,
    issueRefreshTokenId,
    revokeAllForAccount
  };
};

const pruneJtiCache = (cache: Map<string, number>, now: number) => {
  for (const [jti, timestamp] of cache) {
    if (timestamp < now - JTI_TTL_MS) {
      cache.delete(jti);
    }
  }
};

const trackJti = (cache: Map<string, number>, jti: string, now: number) => {
  if (cache.has(jti)) {
    return false;
  }
  cache.set(jti, now);
  return true;
};

const safeDecodeProtectedHeader = (token: string) => {
  try {
    return decodeProtectedHeader(token);
  } catch {
    throw new InvalidSignatureError('invalid token header');
  }
};


