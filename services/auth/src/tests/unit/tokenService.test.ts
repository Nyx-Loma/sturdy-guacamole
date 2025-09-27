beforeAll(() => {
  hashes.sha512 = hash512;
  edUtils.sha512Sync ??= hash512;
  edUtils.sha512 ??= async (message: Uint8Array) => hash512(message);
});
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTokenService } from '../../domain/services/tokenService';
import { loadConfig, resetConfigForTests } from '../../config';
import { createInMemoryTokensRepository } from '../../adapters/inMemory/tokensRepository';
import { createInMemoryDevicesRepository } from '../../adapters/inMemory/devicesRepository';
import { createInMemoryAccountsRepository } from '../../adapters/inMemory/accountsRepository';
import { createDeviceAssertionService } from '../../domain/services/deviceAssertion';
import { createMemoryNonceStore } from '../../adapters/memoryNonceStore';
import { login } from '../../usecases/auth/login';
import { requestDeviceNonce } from '../../usecases/auth/requestNonce';
import { getPublicKey, sign, utils as edUtils, hashes } from '@noble/ed25519';
import { createHash } from 'node:crypto';
import { createKeyResolver } from '../../domain/keys';
import { InvalidSignatureError } from '../../domain/errors';
import { SignJWT } from 'jose';

const hash512 = (message: Uint8Array) => {
  const digest = createHash('sha512').update(Buffer.from(message)).digest();
  return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
};

const withTestConfig = (overrides: Partial<Record<string, string>> = {}) => {
  resetConfigForTests();
  process.env.JWT_SECRET = 'test-signing-secret';
  process.env.JWT_ISSUER = 'auth';
  process.env.JWT_AUDIENCE = 'auth-clients';
  process.env.ACCESS_TOKEN_TTL_SECONDS = '300';
  Object.assign(process.env, overrides);
  const config = loadConfig();
  return config;
};

describe('token service', () => {
  it('issues and verifies access token', async () => {
    const config = withTestConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev', kid: 'primary' });
    const payload = await service.verifyAccessToken(token);
    expect(payload.sub).toBe('acc');
    expect(payload.did).toBe('dev');
    expect(payload.ver).toBe(1);
    expect(payload.jti).toBeDefined();
  });

  it('rejects replayed jti', async () => {
    const config = withTestConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev', kid: 'primary' });
    await service.verifyAccessToken(token);
    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects refresh token reuse after rotation', async () => {
    const config = withTestConfig();
    const tokensRepo = createInMemoryTokensRepository();
    const devicesRepo = createInMemoryDevicesRepository();
    const accountsRepo = createInMemoryAccountsRepository();
    const nonceStore = createMemoryNonceStore();
    const deviceAssertion = createDeviceAssertionService(nonceStore, 60_000);
    const tokenService = createTokenService({ config, keyResolver: createKeyResolver(config) });

    const account = await accountsRepo.createAnonymous();
    const privateKey = new Uint8Array(32).fill(1);
    const publicKey = await getPublicKey(privateKey);
    const device = await devicesRepo.create({ accountId: account.id, publicKey: Buffer.from(publicKey).toString('base64'), status: 'active' } as any);

    const nonceResponse = await requestDeviceNonce(
      {
        repos: { devices: devicesRepo },
        services: { deviceAssertion }
      } as any,
      { accountId: account.id, deviceId: device.id }
    );

    const signature = await sign(Buffer.from(nonceResponse.nonce), privateKey);
    const loginResult = await login(
      {
        repos: { devices: devicesRepo, tokens: tokensRepo },
        services: { deviceAssertion, tokens: tokenService },
        config
      } as any,
      { accountId: account.id, deviceId: device.id, nonce: nonceResponse.nonce, deviceSignature: signature }
    );

    await tokensRepo.revoke(loginResult.refreshToken);
    const revoked = await tokensRepo.findById(loginResult.refreshToken);
    expect(revoked?.revokedAt).toBeDefined();
  });

  it('allows rotated signing keys during leeway window then rejects after expiry', async () => {
    vi.useFakeTimers();
    const config = withTestConfig();

    const encoder = new TextEncoder();
    const oldSecret = encoder.encode('old-secret');
    const newSecret = encoder.encode('new-secret');

    const oldKey = { kid: 'kid-old', secret: oldSecret, active: true, source: 'env' as const };
    const newKey = { kid: 'kid-new', secret: newSecret, active: true, source: 'kms' as const };

    let retiredAt: number | undefined;
    const keyResolver = {
      getActiveSigningKey: vi.fn(async () => oldKey),
      getVerificationKeys: vi.fn(async () => [{ ...oldKey }])
    };

    const service = createTokenService({ config, keyResolver: keyResolver as any, leewaySeconds: 1 });

    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'device' });

    keyResolver.getActiveSigningKey.mockResolvedValue(newKey);
    keyResolver.getVerificationKeys.mockImplementation(async () => {
      retiredAt ??= Date.now();
      return [
        { ...newKey },
        { ...oldKey, active: false, notAfter: retiredAt + 1_000 }
      ];
    });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({ sub: 'acc', did: 'device' });

    vi.advanceTimersByTime(1_500);

    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidSignatureError);

    vi.useRealTimers();
  });

  it('throws when verifying token without kid header', async () => {
    const config = withTestConfig();
    const encoder = new TextEncoder();
    const secret = encoder.encode('missing-kid-secret');
    const keyResolver = {
      getActiveSigningKey: vi.fn(async () => ({ kid: 'primary', secret, active: true, source: 'env' as const })),
      getVerificationKeys: vi.fn(async () => [{ kid: 'primary', secret }])
    };
    const service = createTokenService({ config, keyResolver: keyResolver as any });
    const token = await new SignJWT({ sub: 'acc', did: 'dev', ver: 1, jti: 'jti' })
      .setProtectedHeader({ alg: config.JWT_SIGNING_ALG })
      .setIssuedAt()
      .setIssuer(config.JWT_ISSUER)
      .setAudience(config.JWT_AUDIENCE)
      .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(secret);
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it('throws when signing key is unknown', async () => {
    const config = withTestConfig();
    const encoder = new TextEncoder();
    const secret = encoder.encode('unknown-key');
    const keyResolver = {
      getActiveSigningKey: vi.fn(async () => ({ kid: 'primary', secret, active: true, source: 'env' as const })),
      getVerificationKeys: vi.fn(async () => [])
    };
    const service = createTokenService({ config, keyResolver: keyResolver as any });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev' });
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it('rethrows last invalid signature error when all candidates exhausted', async () => {
    const config = withTestConfig();
    const encoder = new TextEncoder();
    const secret = encoder.encode('key');
    const keyResolver = {
      getActiveSigningKey: vi.fn(async () => ({ kid: 'primary', secret, active: true, source: 'env' as const })),
      getVerificationKeys: vi.fn(async () => [{ kid: 'primary', secret }, { kid: 'primary', secret }])
    };
    const service = createTokenService({ config, keyResolver: keyResolver as any });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev' });
    keyResolver.getVerificationKeys.mockImplementation(async () => [{ kid: 'primary', secret: encoder.encode('other') }]);
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it('continues verification when encountering mismatched verification kid', async () => {
    const config = withTestConfig();
    const encoder = new TextEncoder();
    const secret = encoder.encode('mismatch-secret');
    const keyResolver = {
      getActiveSigningKey: vi.fn(async () => ({ kid: 'primary', secret, active: true, source: 'env' as const })),
      getVerificationKeys: vi.fn(async () => [
        { kid: 'other', secret },
        { kid: 'primary', secret }
      ])
    };
    const service = createTokenService({ config, keyResolver: keyResolver as any });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev' });
    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({ sub: 'acc', did: 'dev' });
    expect(keyResolver.getVerificationKeys).toHaveBeenCalled();
  });

  it('skips expired verification keys based on notAfter window', async () => {
    vi.useFakeTimers();
    const config = withTestConfig({ ACCESS_TOKEN_TTL_SECONDS: '1200' });
    const encoder = new TextEncoder();
    const secret = encoder.encode('expired-secret');
    const now = Date.now();
    const keyResolver = {
      getActiveSigningKey: vi.fn(async () => ({ kid: 'primary', secret, active: true, source: 'env' as const })),
      getVerificationKeys: vi.fn(async () => [
        { kid: 'primary', secret, notAfter: now - 2_000 },
        { kid: 'primary', secret }
      ])
    };
    const service = createTokenService({ config, keyResolver: keyResolver as any, leewaySeconds: 1 });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev' });
    vi.advanceTimersByTime(3_000);
    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({ sub: 'acc', did: 'dev' });
    vi.useRealTimers();
  });

  it('prunes replay cache after TTL allowing reuse', async () => {
    vi.useFakeTimers();
    const config = withTestConfig({ ACCESS_TOKEN_TTL_SECONDS: '1800' });
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev', kid: 'primary' });
    await service.verifyAccessToken(token);
    vi.advanceTimersByTime(5 * 60 * 1000 + 500);
    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({ sub: 'acc', did: 'dev' });
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidSignatureError);
    vi.useRealTimers();
  });

  it('rejects malformed JWT headers', async () => {
    const config = withTestConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    await expect(service.verifyAccessToken('not-a-jwt')).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it('revokes all tokens for account via repository', async () => {
    const config = withTestConfig();
    const service = createTokenService({ config, keyResolver: createKeyResolver(config) });
    const repo = { revokeAllForAccount: vi.fn(async () => {}) };
    await service.revokeAllForAccount(repo, 'account-id');
    expect(repo.revokeAllForAccount).toHaveBeenCalledWith('account-id');
  });

  it('treats JWT claim failures as invalid signature', async () => {
    const config = withTestConfig();
    const encoder = new TextEncoder();
    const secret = encoder.encode('claim-failure');
    const keyResolver = {
      getActiveSigningKey: vi.fn(async () => ({ kid: 'primary', secret, active: true, source: 'env' as const })),
      getVerificationKeys: vi.fn(async () => [
        { kid: 'primary', secret }
      ])
    };
    const service = createTokenService({ config, keyResolver: keyResolver as any });
    const token = await service.issueAccessToken({ accountId: 'acc', deviceId: 'dev' });
    config.JWT_AUDIENCE = 'different-audience';
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});


