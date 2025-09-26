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

const hash512 = (message: Uint8Array) => {
  const digest = createHash('sha512').update(Buffer.from(message)).digest();
  return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
};

const withTestConfig = () => {
  resetConfigForTests();
  process.env.JWT_SECRET = 'test-signing-secret';
  process.env.JWT_ISSUER = 'auth';
  process.env.JWT_AUDIENCE = 'auth-clients';
  process.env.ACCESS_TOKEN_TTL_SECONDS = '300';
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
});


