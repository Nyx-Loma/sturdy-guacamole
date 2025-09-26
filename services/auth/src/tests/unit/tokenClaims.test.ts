import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { loadConfig, resetConfigForTests } from '../../config';
import { createTokenService } from '../../domain/services/tokenService';
import { createKeyResolver } from '../../domain/keys';

const cleanupEnv = () => {
  delete process.env.JWT_AUDIENCE;
  delete process.env.JWT_ISSUER;
  delete process.env.JWT_SECRET;
  delete process.env.JWT_ACTIVE_KID;
  delete process.env.JWT_SECONDARY_SECRET;
  delete process.env.JWT_SECONDARY_KID;
  delete process.env.JWT_SECONDARY_NOT_AFTER;
  delete process.env.JWT_ROTATION_LEEWAY_SECONDS;
};

beforeEach(() => {
  cleanupEnv();
  resetConfigForTests();
});

describe('token claims', () => {
  it('accepts clock skew within tolerance', async () => {
    const config = loadConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    vi.useFakeTimers();
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev', kid: 'primary' });
    vi.advanceTimersByTime(55_000);
    await expect(service.verifyAccessToken(token)).resolves.toHaveProperty('sub', 'acc');
    vi.useRealTimers();
  });

  it('rejects token beyond clock tolerance', async () => {
    process.env.JWT_ROTATION_LEEWAY_SECONDS = '0';
    const config = loadConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    vi.useFakeTimers();
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev', kid: 'primary' });
    vi.advanceTimersByTime((config.ACCESS_TOKEN_TTL_SECONDS + 120) * 1000);
    await expect(service.verifyAccessToken(token)).rejects.toThrow();
    vi.useRealTimers();
  });

  it('rejects token with wrong audience', async () => {
    process.env.JWT_AUDIENCE = 'expected';
    const config = loadConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const token = await new SignJWT({ sub: 'acc', did: 'dev', ver: 1 })
      .setProtectedHeader({ alg: 'HS256', kid: 'primary' })
      .setIssuer(config.JWT_ISSUER)
      .setAudience('wrong')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects token with wrong issuer', async () => {
    process.env.JWT_ISSUER = 'expected-issuer';
    const config = loadConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const token = await new SignJWT({ sub: 'acc', did: 'dev', ver: 1 })
      .setProtectedHeader({ alg: 'HS256', kid: 'primary' })
      .setIssuer('attacker')
      .setAudience(config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects token missing kid header', async () => {
    const config = loadConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const token = await new SignJWT({ sub: 'acc', did: 'dev', ver: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(config.JWT_ISSUER)
      .setAudience(config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects token with reused jti', async () => {
    const config = loadConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev', kid: 'primary' });
    const payload = await service.verifyAccessToken(token);

    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const replay = await new SignJWT({ sub: payload.sub, did: payload.did, ver: 1, jti: payload.jti })
      .setProtectedHeader({ alg: 'HS256', kid: 'primary' })
      .setIssuer(config.JWT_ISSUER)
      .setAudience(config.JWT_AUDIENCE)
      .setIssuedAt(payload.iat)
      .setExpirationTime(payload.exp)
      .sign(secret);

    await expect(service.verifyAccessToken(replay)).rejects.toThrow();
  });

  it('rejects token with missing audience', async () => {
    const config = loadConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const token = await new SignJWT({ sub: 'acc', did: 'dev', ver: 1 })
      .setProtectedHeader({ alg: 'HS256', kid: 'primary' })
      .setIssuer(config.JWT_ISSUER)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects token with missing issuer', async () => {
    const config = loadConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const token = await new SignJWT({ sub: 'acc', did: 'dev', ver: 1 })
      .setProtectedHeader({ alg: 'HS256', kid: 'primary' })
      .setAudience(config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });
});


