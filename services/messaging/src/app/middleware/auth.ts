import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, errors as joseErrors, type JWTPayload, type JWTVerifyResult } from 'jose';
import pino from 'pino';
import type { MessagingConfig } from '../../config';
import { messagingMetrics } from '../../observability/metrics';
import { resolveVerificationKey } from '../../domain/services/tokenVerification';
import type { AuthContext } from '../../domain/types/auth.types';

export const AUTH_ERROR_CODES = {
  missingToken: 'MISSING_TOKEN',
  invalidToken: 'INVALID_TOKEN',
  tokenExpired: 'TOKEN_EXPIRED',
  tokenAudienceMismatch: 'TOKEN_AUDIENCE_MISMATCH',
  tokenIssuerMismatch: 'TOKEN_ISSUER_MISMATCH',
  tokenNotBefore: 'TOKEN_NOT_BEFORE',
  tokenInvalidAlg: 'TOKEN_INVALID_ALG',
  tokenInvalidKid: 'TOKEN_INVALID_KID',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export interface RequireAuthDependencies {
  config: MessagingConfig;
  clockToleranceSeconds?: number;
}

interface VerificationResult {
  payload: JWTPayload;
  protectedHeader: JWTVerifyResult['protectedHeader'];
}

export const createRequireAuth = (deps: RequireAuthDependencies) => {
  const { config } = deps;
  const logger = pino({ level: config.LOG_LEVEL, name: 'auth' });
  
  // Parse allowed algorithms from config
  const algorithms = config.JWT_ALGS.split(',')
    .map((alg) => alg.trim())
    .filter(Boolean);

  const jwksUrl = config.JWT_JWKS_URL;
  const pemKey = config.JWT_PUBLIC_KEY;
  const issuer = config.JWT_ISSUER;
  const audience = config.JWT_AUDIENCE;
  const clockToleranceSeconds = config.JWT_CLOCK_SKEW;

  // Config schema already validates these, but fail-safe check
  if (!jwksUrl && !pemKey) {
    throw new Error('JWT_JWKS_URL or JWT_PUBLIC_KEY must be configured');
  }
  if (!issuer || !audience) {
    throw new Error('JWT_ISSUER and JWT_AUDIENCE must be configured');
  }

  const jwksFetcher = jwksUrl
    ? createRemoteJWKSet(new URL(jwksUrl), {
        cooldownDuration: config.JWT_JWKS_CACHE_TTL_MS,
        fetchTimeout: config.JWT_JWKS_FETCH_TIMEOUT_MS,
      })
    : null;

  const verifyToken = async (token: string): Promise<VerificationResult> => {
    const verificationOptions = {
      issuer,
      audience,
      algorithms,
      clockTolerance: clockToleranceSeconds,
    } as const;

    if (jwksFetcher) {
      return jwtVerify(token, jwksFetcher, verificationOptions);
    }

    const key = await resolveVerificationKey(pemKey!, algorithms);
    return jwtVerify(token, key, verificationOptions);
  };

  logger.info({
    issuer,
    audience,
    algorithms,
    jwksUrl,
    clockToleranceSeconds,
  }, 'auth_config_loaded');

  const ensureStartTime = (request: FastifyRequest): number => {
    let context = request.context as { startTime?: number } | undefined;
    if (!context) {
      context = {};
      Object.defineProperty(request, 'context', {
        value: context,
        configurable: true,
        enumerable: false,
        writable: false,
      });
    }

    if (context.startTime === undefined) {
      context.startTime = Date.now();
    }

    return context.startTime;
  };

  const recordMetric = (outcome: string, startedAt: number) => {
    const durationMs = Date.now() - startedAt;
    messagingMetrics.authRequestsTotal.labels({ outcome }).inc();
    messagingMetrics.authLatencyMs.observe(durationMs);
  };

  const fail = (
    reply: FastifyReply,
    request: FastifyRequest,
    outcome: string,
    code: AuthErrorCode,
    message: string,
    loggingMeta?: Record<string, unknown>
  ): void => {
    const startedAt = ensureStartTime(request);
    recordMetric(outcome, startedAt);
    logger.warn({ reqId: request.id, code, ...loggingMeta }, 'auth_failed');
    void reply.code(401).send({
      code,
      message,
      requestId: request.id,
    });
  };

  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const startedAt = ensureStartTime(request);

    if (request.method === 'OPTIONS' || request.routerPath === '/health' || request.routerPath?.startsWith('/metrics')) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return fail(reply, request, 'missing', AUTH_ERROR_CODES.missingToken, 'Authorization header required');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return fail(reply, request, 'missing', AUTH_ERROR_CODES.missingToken, 'Authorization header required');
    }

    try {
      const { payload, protectedHeader } = await verifyToken(token);
      recordMetric('ok', startedAt);

      if (protectedHeader.alg && !algorithms.includes(protectedHeader.alg)) {
        return fail(reply, request, 'invalid_alg', AUTH_ERROR_CODES.tokenInvalidAlg, 'Token algorithm not allowed', {
          alg: protectedHeader.alg,
        });
      }

      if (jwksFetcher && protectedHeader.kid === undefined) {
        return fail(reply, request, 'missing_kid', AUTH_ERROR_CODES.tokenInvalidKid, 'Token kid required');
      }

      const { sub, deviceId, sessionId, scope, iat, exp, nbf } = payload as JWTPayload & {
        deviceId?: string;
        sessionId?: string;
        scope?: string | string[];
      };

      if (!sub) {
        return fail(reply, request, 'invalid', AUTH_ERROR_CODES.invalidToken, 'Token missing subject');
      }
      if (!deviceId) {
        return fail(reply, request, 'invalid', AUTH_ERROR_CODES.invalidToken, 'Token missing deviceId');
      }
      if (!sessionId) {
        return fail(reply, request, 'invalid', AUTH_ERROR_CODES.invalidToken, 'Token missing sessionId');
      }
      if (typeof iat !== 'number') {
        return fail(reply, request, 'invalid', AUTH_ERROR_CODES.invalidToken, 'Token missing issued-at');
      }
      if (typeof exp !== 'number') {
        return fail(reply, request, 'invalid', AUTH_ERROR_CODES.invalidToken, 'Token missing expiration');
      }
      const nowSeconds = Date.now() / 1000;
      if (typeof nbf === 'number' && nbf > nowSeconds + clockToleranceSeconds) {
        return fail(reply, request, 'not_before', AUTH_ERROR_CODES.tokenNotBefore, 'Token not active yet');
      }

      const scopes = Array.isArray(scope)
        ? scope
        : typeof scope === 'string'
          ? scope.split(' ').filter(Boolean)
          : [];

      Object.defineProperty(request, 'auth', {
        value: {
          userId: sub,
          deviceId,
          sessionId,
          scope: scopes,
          issuedAt: iat,
          expiresAt: exp,
        } satisfies AuthContext,
        configurable: true,
        writable: false,
        enumerable: false,
      });

      messagingMetrics.authenticatedRequestsTotal.inc();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'token verification failed';

      if (error instanceof joseErrors.JWTExpired) {
        recordMetric('expired', startedAt);
        logger.info({ reqId: request.id }, 'auth_token_expired');
        void reply.code(401).send({
          code: AUTH_ERROR_CODES.tokenExpired,
          message: 'Token expired',
          requestId: request.id,
        });
        return;
      }

      if (error instanceof joseErrors.JWTClaimValidationFailed) {
        const claim = error.claim ?? 'unknown';
        recordMetric('invalid_claim', startedAt);
        logger.warn({ reqId: request.id, claim }, 'auth_claim_validation_failed');
        const code = claim === 'nbf'
          ? AUTH_ERROR_CODES.tokenNotBefore
          : claim === 'aud'
            ? AUTH_ERROR_CODES.tokenAudienceMismatch
            : claim === 'iss'
              ? AUTH_ERROR_CODES.tokenIssuerMismatch
              : AUTH_ERROR_CODES.invalidToken;
        void reply.code(401).send({
          code,
          message: 'Token claim validation failed',
          requestId: request.id,
        });
        return;
      }

      recordMetric('invalid', startedAt);
      logger.warn({ reqId: request.id, err: errorMessage }, 'auth_verification_failed');
      void reply.code(401).send({
        code: AUTH_ERROR_CODES.invalidToken,
        message: 'Token validation failed',
        requestId: request.id,
      });
    }
  };
};

export type RequireAuth = ReturnType<typeof createRequireAuth>;


