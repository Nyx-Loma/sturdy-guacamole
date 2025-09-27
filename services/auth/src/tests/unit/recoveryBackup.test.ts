import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createRecoveryBackupService } from '../../domain/services/recoveryBackup';
import { createInMemoryRecoveryRepository } from '../../adapters/inMemory/recoveryRepository';
import { AuthMetrics } from '../../domain/metrics';
import { RecoveryPolicyError, RecoveryValidationError } from '../../domain/errors';

const makeConfig = (overrides: Partial<ReturnType<typeof baseConfig>> = {}) => ({
  ...baseConfig(),
  ...overrides
});

const baseConfig = () => ({
  dummyCipherBytes: 512,
  dummyNonceBytes: 24,
  dummySaltBytes: 32,
  dummyAssociatedDataBytes: 32,
  dummyArgon: {
    timeCost: 3,
    memoryCost: 256_000,
    parallelism: 2
  },
  minLatencyMs: 0,
  argonFloor: {
    memoryDesktop: 524_288,
    memoryMobile: 262_144,
    timeCost: 3,
    parallelism: 2
  }
});

describe('recovery backup service', () => {
  let repo: ReturnType<typeof createInMemoryRecoveryRepository>;
  let metrics: AuthMetrics;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    repo = createInMemoryRecoveryRepository();
    metrics = new AuthMetrics();
  });

  it('returns dummy payload when account missing', async () => {
    const service = createRecoveryBackupService(repo, makeConfig(), metrics);
    const result = await service.prepare(null);
    expect(result.isDummy).toBe(true);
    expect(result.payload.cipherLength).toBe(512);
    expect(result.payload.latencyFloorMs).toBeGreaterThanOrEqual(0);
  });

  it('enforces latency floor', async () => {
    const config = makeConfig({ minLatencyMs: 50 });
    const service = createRecoveryBackupService(repo, config, metrics);
    const started = Date.now();
    const preparePromise = service.prepare(null);
    await vi.advanceTimersByTimeAsync(config.minLatencyMs - 10);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(20);
    await preparePromise;
    expect(Date.now() - started).toBeGreaterThanOrEqual(config.minLatencyMs);
  });

  it('rejects argon params below policy floor', async () => {
    const config = makeConfig();
    const service = createRecoveryBackupService(repo, config, metrics);
    await expect(service.createBackup({
      accountId: 'acc',
      blobVersion: 1,
      ciphertext: new Uint8Array(10),
      nonce: new Uint8Array(24),
      associatedData: new Uint8Array(16),
      salt: new Uint8Array(32),
      argonParams: {
        timeCost: config.argonFloor.timeCost - 1,
        memoryCost: config.argonFloor.memoryDesktop,
        parallelism: config.argonFloor.parallelism
      },
      profile: 'desktop',
      cipherLength: 10,
      padLength: 2
    })).rejects.toThrow(RecoveryPolicyError);
  });

  it('stores active blob and exposes status', async () => {
    const config = makeConfig();
    const service = createRecoveryBackupService(repo, config, metrics);
    const payload = new Uint8Array(64);
    await service.createBackup({
      accountId: 'acc',
      blobVersion: 2,
      ciphertext: payload,
      nonce: new Uint8Array(24),
      associatedData: new Uint8Array(32),
      salt: new Uint8Array(32),
      argonParams: {
        timeCost: config.argonFloor.timeCost,
        memoryCost: config.argonFloor.memoryDesktop,
        parallelism: config.argonFloor.parallelism
      },
      profile: 'desktop',
      cipherLength: payload.length,
      padLength: 0
    });

    const status = await service.getStatus('acc');
    expect(status).toMatchObject({ hasBackup: true, blobVersion: 2 });
    const prepared = await service.prepare('acc');
    expect(prepared.isDummy).toBe(false);
    expect(prepared.payload.cipherLength).toBe(payload.length);
    expect(prepared.payload.profile).toBe('desktop');
  });

  it('caches dummy payload', async () => {
    const service = createRecoveryBackupService(repo, makeConfig(), metrics);
    const first = await service.prepare(null);
    await vi.advanceTimersByTimeAsync(0);
    const second = await service.prepare(null);
    expect(second.payload.ciphertext).toEqual(first.payload.ciphertext);
  });

  it('rejects invalid profile', async () => {
    const service = createRecoveryBackupService(repo, makeConfig(), metrics);
    await expect(service.createBackup({
      accountId: 'acc',
      blobVersion: 1,
      ciphertext: new Uint8Array(16),
      nonce: new Uint8Array(24),
      associatedData: new Uint8Array(32),
      salt: new Uint8Array(32),
      argonParams: {
        timeCost: 3,
        memoryCost: 524_288,
        parallelism: 2
      },
      // @ts-expect-error invalid profile
      profile: 'tablet',
      cipherLength: 16,
      padLength: 0
    })).rejects.toThrow(RecoveryValidationError);
  });

  it('derives verifier when MRC provided', async () => {
    const service = createRecoveryBackupService(repo, makeConfig(), metrics);
    const mrc = new Uint8Array(32).fill(7);
    const salt = new Uint8Array(32).fill(9);
    const blobId = await service.createBackup({
      accountId: 'acc',
      blobVersion: 3,
      ciphertext: new Uint8Array(32),
      nonce: new Uint8Array(24),
      associatedData: new Uint8Array(32),
      salt,
      argonParams: {
        timeCost: 3,
        memoryCost: 524_288,
        parallelism: 2
      },
      profile: 'desktop',
      cipherLength: 32,
      padLength: 0,
      mrc
    });

    const stored = await repo.getBlobById(blobId);
    expect(stored?.verifier?.length).toBe(32);
  });
});
