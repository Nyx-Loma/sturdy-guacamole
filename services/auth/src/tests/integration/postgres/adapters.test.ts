import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../adapters/postgres/pool';
import {
  createPostgresAccountsRepository,
  createPostgresDevicesRepository,
  createPostgresPairingRepository,
  createPostgresTokensRepository,
  createPostgresRecoveryRepository
} from '../../../adapters/postgres';
import { randomUUID } from 'node:crypto';

const POSTGRES_URL = process.env.POSTGRES_URL ?? (
  process.env.CI ? 'postgres://postgres:postgres@postgres:5432/postgres' : 'postgres://postgres:postgres@127.0.0.1:55432/postgres'
);

const makeConfig = () => ({
  STORAGE_DRIVER: 'postgres',
  POSTGRES_URL,
  POSTGRES_SCHEMA: 'auth'
});

describe('postgres adapters', () => {
  let pool: ReturnType<typeof getPool> | undefined;
  let accountsRepo: ReturnType<typeof createPostgresAccountsRepository> | undefined;
  let devicesRepo: ReturnType<typeof createPostgresDevicesRepository> | undefined;
  let tokensRepo: ReturnType<typeof createPostgresTokensRepository> | undefined;
  let pairingRepo: ReturnType<typeof createPostgresPairingRepository> | undefined;
  let recoveryRepo: ReturnType<typeof createPostgresRecoveryRepository> | undefined;

  const truncateAll = async () => {
    await pool!.query('TRUNCATE auth.recovery_blobs, auth.recovery, auth.pairing_tokens, auth.refresh_tokens, auth.devices, auth.accounts RESTART IDENTITY CASCADE');
  };

  beforeAll(async () => {
    const config = makeConfig();
    pool = getPool(config);
    await pool.query('CREATE SCHEMA IF NOT EXISTS auth');
    const sql = await import('fs/promises').then((fs) => fs.readFile(process.cwd() + '/services/auth/src/adapters/postgres/migrations/001_init.sql', 'utf8'));
    await pool.query(sql);
    accountsRepo = createPostgresAccountsRepository(pool);
    devicesRepo = createPostgresDevicesRepository(pool);
    tokensRepo = createPostgresTokensRepository(pool);
    pairingRepo = createPostgresPairingRepository(pool);
    recoveryRepo = createPostgresRecoveryRepository(pool);
  });

  afterAll(async () => {
    if (!pool) {
      return;
    }
    await pool.query('DROP SCHEMA IF EXISTS auth CASCADE');
    await pool.end();
    pool = undefined;
  });

  beforeEach(async () => {
    await truncateAll();
  });

  const makeAccount = async () => accountsRepo!.createAnonymous();
  const makeAccountAndDevice = async () => {
    const account = await makeAccount();
    const device = await devicesRepo!.create({
      accountId: account.id,
      publicKey: 'pk',
      displayName: null,
      status: 'active'
    } as any);
    return { account, device };
  };

  it('accounts repository creates and updates status', async () => {
    const account = await accountsRepo.createAnonymous();
    expect(account.status).toBe('active');
    await accountsRepo.updateStatus(account.id, 'suspended');
    const fetched = await accountsRepo.findById(account.id);
    expect(fetched?.status).toBe('suspended');
  });

  it('devices repository persists and counts active devices', async () => {
    const account = await makeAccount();
    const created = await devicesRepo.create({ accountId: account.id, publicKey: 'pk', displayName: null, status: 'active' } as any);
    expect(created.accountId).toBe(account.id);
    const count = await devicesRepo.countActiveForAccount(account.id);
    expect(count).toBe(1);
  });

  it('devices repository rejects when account does not exist', async () => {
    await expect(
      devicesRepo.create({ accountId: randomUUID(), publicKey: 'pk-missing', displayName: null, status: 'active' } as any)
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('tokens repository creates and revokes tokens', async () => {
    const { account, device } = await makeAccountAndDevice();
    const created = await tokensRepo.create({
      id: randomUUID(),
      accountId: account.id,
      deviceId: device.id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000)
    });
    await tokensRepo.revoke(created.id);
    const fetched = await tokensRepo.findById(created.id);
    expect(fetched?.revokedAt).toBeInstanceOf(Date);
  });

  it('pairing repository handles lifecycle', async () => {
    const { account, device } = await makeAccountAndDevice();
    const token = randomUUID();
    await pairingRepo.create({
      token,
      accountId: account.id,
      primaryDeviceId: device.id,
      newDevicePublicKey: 'pk-new',
      nonce: 'nonce',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000)
    });
    const stored = await pairingRepo.findByToken(token);
    expect(stored?.token).toBe(token);
    await pairingRepo.markUsed(token);
    const updated = await pairingRepo.findByToken(token);
    expect(updated?.used).toBe(true);
    // used_at column not present; ensure used flag flips
    expect(updated?.pendingPublicKey).toBeUndefined();
  });

  it('recovery repository stores blobs', async () => {
    const account = await makeAccount();
    await recoveryRepo.upsert({ accountId: account.id, rcHash: 'hash', params: { timeCost: 2, memoryCost: 1024, parallelism: 1, version: 1 }, updatedAt: new Date() });
    const record = await recoveryRepo.find(account.id);
    expect(record?.rcHash).toBe('hash');
    await recoveryRepo.createBlob({
      id: randomUUID(),
      accountId: account.id,
      blobVersion: 1,
      ciphertext: Buffer.from([1]),
      nonce: Buffer.from([2]),
      associatedData: Buffer.from([3]),
      salt: Buffer.from([4]),
      argonParams: { timeCost: 2, memoryCost: 1024, parallelism: 1 },
      profile: 'desktop',
      cipherLength: 1,
      padLength: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      previousBlobId: null,
      sizeBytes: 8
    });
    const blob = await recoveryRepo.getActiveBlob(account.id);
    expect(blob?.cipherLength).toBe(1);
  });

  it('propagates pool query failures to callers', async () => {
    const spy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('forced timeout'));
    await expect(
      devicesRepo.create({ accountId: randomUUID(), publicKey: 'pk-error', displayName: null, status: 'active' } as any)
    ).rejects.toThrow('forced timeout');
    spy.mockRestore();
  });
});
