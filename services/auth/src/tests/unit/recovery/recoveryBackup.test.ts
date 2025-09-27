import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRecoveryBackupService } from '../../../domain/services/recoveryBackup';
import type { RecoveryRepository } from '../../../repositories/recoveryRepo';
import { AuthMetrics } from '../../../domain/metrics';
import { RecoveryPolicyError, RecoveryValidationError } from '../../../domain/errors';

const baseConfig = {
  dummyCipherBytes: 4,
  dummyNonceBytes: 4,
  dummySaltBytes: 4,
  dummyAssociatedDataBytes: 4,
  dummyArgon: { timeCost: 1, memoryCost: 8, parallelism: 1 },
  minLatencyMs: 0,
  argonFloor: { memoryDesktop: 1024, memoryMobile: 512, timeCost: 1, parallelism: 1 },
  kmsPepper: Buffer.from('pepper'),
  retainBlobs: undefined
};

const getBackupMetric = async (metrics: AuthMetrics, stage: string, outcome: string) => {
  const raw = await metrics.getRegistry().getSingleMetricAsString('auth_backup_event_total').catch(() => '');
  const regex = new RegExp(`auth_backup_event_total\\{stage="${stage}",outcome="${outcome}",size_bucket="(\\w+)"} (\\d+)`);
  const match = raw.match(regex);
  return match ? Number(match[2]) : 0;
};

type MockRecoveryRepository = RecoveryRepository & {
  [key: string]: ReturnType<typeof vi.fn>;
};

const makeRepo = (): MockRecoveryRepository => ({
  upsert: vi.fn(),
  find: vi.fn(),
  delete: vi.fn(),
  createBlob: vi.fn(),
  getActiveBlob: vi.fn(),
  getPreviousBlob: vi.fn(),
  getBlobById: vi.fn(),
  listBlobs: vi.fn(),
  deleteBlob: vi.fn(),
  deactivateBlobs: vi.fn()
});

describe('recoveryBackupService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let metrics: AuthMetrics;

  beforeEach(() => {
    repo = makeRepo();
    metrics = new AuthMetrics();
  });

  const baseInput = () => ({
    accountId: 'acc',
    blobVersion: 1,
    ciphertext: new Uint8Array([1, 2, 3]),
    nonce: new Uint8Array([4, 5, 6]),
    associatedData: new Uint8Array([7, 8]),
    salt: new Uint8Array([9, 10]),
    argonParams: { timeCost: 2, memoryCost: 2048, parallelism: 1 },
    profile: 'desktop' as const,
    cipherLength: 3,
    padLength: 0
  });

  it('enforces argon floor policies', async () => {
    const service = createRecoveryBackupService(repo, baseConfig, metrics);
    await expect(service.createBackup({ ...baseInput(), argonParams: { timeCost: 0, memoryCost: 1, parallelism: 1 } })).rejects.toBeInstanceOf(RecoveryPolicyError);
    expect(repo.createBlob).not.toHaveBeenCalled();
  });

  it('stores KEK verifier when pepper provided', async () => {
    const service = createRecoveryBackupService(repo, baseConfig, metrics);
    repo.createBlob.mockResolvedValue(undefined);
    await service.createBackup({ ...baseInput(), mrc: new Uint8Array([1, 1]) });
    const call = repo.createBlob.mock.calls[0][0];
    expect(call.kekVerifier).toBeInstanceOf(Buffer);
    expect(call.sizeBytes).toBeGreaterThan(0);
  });

  it('prepare returns dummy payload when account missing', async () => {
    const service = createRecoveryBackupService(repo, baseConfig, metrics);
    repo.getActiveBlob.mockResolvedValue(null);
    const result = await service.prepare('acc');
    expect(result.isDummy).toBe(true);
    expect(result.payload.cipherLength).toBe(baseConfig.dummyCipherBytes);
  });

  it('restore throws when KEK verifier mismatch', async () => {
    const service = createRecoveryBackupService(repo, baseConfig, metrics);
    repo.getActiveBlob.mockResolvedValue({
      id: 'blob',
      accountId: 'acc',
      blobVersion: 1,
      ciphertext: Buffer.from([1, 2, 3]),
      nonce: Buffer.from([4, 5, 6]),
      associatedData: Buffer.from([7, 8]),
      salt: Buffer.from([9, 10]),
      argonParams: { timeCost: 2, memoryCost: 2048, parallelism: 1 },
      profile: 'desktop',
      cipherLength: 3,
      padLength: 0,
      verifier: null,
      kekVerifier: Buffer.from([9, 9]),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      previousBlobId: null,
      sizeBytes: 16
    });
    await expect(service.restore({ accountId: 'acc', mrc: new Uint8Array([1, 1]) })).rejects.toBeInstanceOf(RecoveryValidationError);
  });

  it('reuses cached dummy payload across prepare calls', async () => {
    const service = createRecoveryBackupService(repo, baseConfig, metrics);
    repo.getActiveBlob.mockResolvedValue(null);
    const first = await service.prepare(null);
    const second = await service.prepare(null);
    expect(first.payload).toBe(second.payload);
  });

  it('prunes older blobs when retainBlobs is set', async () => {
    const config = { ...baseConfig, retainBlobs: 1 };
    const service = createRecoveryBackupService(repo, config, metrics);
    repo.listBlobs.mockResolvedValue([
      { id: 'keep', createdAt: new Date('2024-01-02'), cipherLength: 1, padLength: 0 } as any,
      { id: 'drop', createdAt: new Date('2024-01-01'), cipherLength: 1, padLength: 0 } as any
    ]);
    repo.createBlob.mockResolvedValue(undefined);
    await service.createBackup({ ...baseInput(), mrc: new Uint8Array([1, 1]) });
    expect(repo.deleteBlob).toHaveBeenCalledWith('drop');
  });

  it('records failure metrics when restore throws', async () => {
    const service = createRecoveryBackupService(repo, baseConfig, metrics);
    repo.getActiveBlob.mockResolvedValue(null);
    await expect(service.restore({ accountId: 'acc', mrc: new Uint8Array([1]) })).rejects.toBeInstanceOf(RecoveryValidationError);
    expect(await getBackupMetric(metrics, 'restore', 'fail')).toBe(1);
  });
});
