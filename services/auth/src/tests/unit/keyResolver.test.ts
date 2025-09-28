import { describe, expect, it, vi } from 'vitest';
import { createKeyResolver } from '../../domain/keys';
import type { KmsClient, SigningKeyRecord } from '../../domain/keys/types';

const baseConfig = {
  JWT_SECRET: 'primary-secret',
  JWT_ACTIVE_KID: 'primary',
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
  ACCESS_TOKEN_TTL_SECONDS: 300,
  JWT_ROTATION_LEEWAY_SECONDS: 60,
  JWT_SECONDARY_SECRET: undefined,
  JWT_SECONDARY_KID: undefined
} as any;

describe('createKeyResolver', () => {
  it('returns env key when no KMS client provided', async () => {
    const resolver = createKeyResolver(baseConfig);
    const active = await resolver.getActiveSigningKey();
    expect(active.kid).toBe('primary');
    expect(active.source).toBe('env');
  });

  it('merges KMS keys and respects active flag', async () => {
    const kmsRecords: SigningKeyRecord[] = [
      { kid: 'kms-1', material: Buffer.from('kms-secret').toString('base64'), encoding: 'base64', active: true }
    ];
    const kmsClient: KmsClient = { fetchSigningKeys: vi.fn().mockResolvedValue(kmsRecords) };
    const resolver = createKeyResolver({ ...baseConfig, JWT_ACTIVE_KID: 'kms-1' }, { kmsClient });
    const active = await resolver.getActiveSigningKey();
    expect(active.kid).toBe('kms-1');
    expect(Buffer.from(active.secret).toString()).toBe('kms-secret');
    const keys = await resolver.getVerificationKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0].source).toBe('kms');
  });

  it('caches kms calls until ttl expires', async () => {
    const kmsRecords: SigningKeyRecord[] = [{ kid: 'kms', material: 'a2V5', encoding: 'base64url', active: true }];
    const kmsClient: KmsClient = { fetchSigningKeys: vi.fn().mockResolvedValue(kmsRecords) };
    const now = vi.fn(() => 0);
    const resolver = createKeyResolver(baseConfig, { kmsClient, cacheTtlMs: 1000, now });
    await resolver.getVerificationKeys();
    await resolver.getVerificationKeys();
    expect(kmsClient.fetchSigningKeys).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1500);
    await resolver.getVerificationKeys();
    expect(kmsClient.fetchSigningKeys).toHaveBeenCalledTimes(2);
  });

  it('throws when kms returns invalid record', async () => {
    const kmsClient: KmsClient = { fetchSigningKeys: vi.fn().mockResolvedValue([{ kid: '', material: '' }]) } as any;
    const resolver = createKeyResolver(baseConfig, { kmsClient });
    await expect(resolver.getVerificationKeys()).rejects.toThrow('kms returned incomplete signing key record');
  });

  it('supports hex and base64url encodings and merge order', async () => {
    const hex = Buffer.from('deadbeef', 'hex').toString('hex');
    const b64url = Buffer.from('kms-2').toString('base64url');
    const kmsRecords: SigningKeyRecord[] = [
      { kid: 'hex', material: hex, encoding: 'hex', active: false },
      { kid: 'b64url', material: b64url, encoding: 'base64url', active: true }
    ];
    const kmsClient: KmsClient = { fetchSigningKeys: vi.fn().mockResolvedValue(kmsRecords) };
    const resolver = createKeyResolver({ ...baseConfig, JWT_ACTIVE_KID: 'b64url' }, { kmsClient });
    const keys = await resolver.getVerificationKeys();
    // active first
    expect(keys[0].kid).toBe('b64url');
    // env overridden by kms when same kid
    const kmsRecords2: SigningKeyRecord[] = [{ kid: 'primary', material: Buffer.from('new').toString('base64'), encoding: 'base64', active: true }];
    const resolver2 = createKeyResolver(baseConfig, { kmsClient: { fetchSigningKeys: vi.fn().mockResolvedValue(kmsRecords2) } });
    const active2 = await resolver2.getActiveSigningKey();
    expect(Buffer.from(active2.secret).toString()).toBe('new');
  });

  it('wraps kms fetch errors in InvalidSignatureError', async () => {
    const kmsClient: KmsClient = { fetchSigningKeys: vi.fn().mockRejectedValue(new Error('boom')) };
    const resolver = createKeyResolver(baseConfig, { kmsClient });
    await expect(resolver.getVerificationKeys()).rejects.toThrow('kms signing key fetch failed: boom');
  });
});
