import { describe, expect, it, beforeEach, vi } from 'vitest';
import { RecoveryValidationError } from '../../../domain/errors';
import type { RecoveryRepository } from '../../../repositories/recoveryRepo';
import { AuthMetrics } from '../../../domain/metrics';

const defaultPolicy = { timeCost: 3, memoryCost: 1 << 16, parallelism: 1, version: 1 };
const backupConfig = {
  dummyCipherBytes: 4,
  dummyNonceBytes: 4,
  dummySaltBytes: 4,
  dummyAssociatedDataBytes: 4,
  dummyArgon: { timeCost: 1, memoryCost: 8, parallelism: 1 },
  minLatencyMs: 0,
  argonFloor: { memoryDesktop: 1024, memoryMobile: 512, timeCost: 1, parallelism: 1 },
  retainBlobs: 2
};

const makeRepo = (): RecoveryRepository & { [key: string]: any } => ({
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

const createBackupStub = () => ({
  restore: vi.fn(),
  createBackup: vi.fn(),
  prepare: vi.fn(),
  deactivateBlobs: vi.fn(),
  listBlobs: vi.fn(),
  deleteBlob: vi.fn()
});

let backupServiceStub = createBackupStub();
const createRecoveryBackupServiceMock = vi.fn(() => backupServiceStub);
let createRecoveryService: typeof import('../../../domain/services/recoveryService').createRecoveryService;

vi.mock('../../../domain/services/recoveryBackup', () => ({
  createRecoveryBackupService: createRecoveryBackupServiceMock
}));

describe('recoveryService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let metrics: AuthMetrics;
  const deps = {
    revokeTokens: vi.fn(async () => {}),
    revokeDevices: vi.fn(async () => {})
  };

  beforeEach(async () => {
    vi.resetModules();
    backupServiceStub = createBackupStub();
    createRecoveryBackupServiceMock.mockImplementation(() => backupServiceStub);
    repo = makeRepo();
    metrics = new AuthMetrics();
    deps.revokeTokens.mockClear();
    deps.revokeDevices.mockClear();
    ({ createRecoveryService } = await import('../../../domain/services/recoveryService'));
  });

  it('rejects setup when argon policy below baseline', async () => {
    const service = createRecoveryService(repo, { policy: { ...defaultPolicy, memoryCost: 1024 }, backup: backupConfig, metrics }, deps);
    await expect(service.setup('acc', 'code')).rejects.toThrow('argon2 parameters below policy baseline');
  });

  it('consume throws InvalidRecoveryCodeError with missing record', async () => {
    repo.find.mockResolvedValue(null);
    const service = createRecoveryService(repo, { policy: defaultPolicy, backup: backupConfig, metrics }, deps);
    await expect(service.consume('acc', 'code')).rejects.toHaveProperty('code', 'INVALID_RECOVERY_CODE');
  });

  it('consume deletes record on successful verification', async () => {
    repo.find.mockResolvedValue({ rcHash: await import('argon2').then(({ default: argon2 }) => argon2.hash('secret')), params: { ...defaultPolicy }, updatedAt: new Date(), accountId: 'acc' });
    const service = createRecoveryService(repo, { policy: defaultPolicy, backup: backupConfig, metrics }, deps);
    await service.consume('acc', 'secret');
    expect(repo.delete).toHaveBeenCalledWith('acc');
  });

  it('restore throws when no backup available', async () => {
    repo.getActiveBlob.mockResolvedValue(null);
    repo.find.mockResolvedValue({ rcHash: 'hash', params: { ...defaultPolicy }, updatedAt: new Date() });
    const service = createRecoveryService(repo, { policy: defaultPolicy, backup: backupConfig, metrics }, deps);
    backupServiceStub.restore.mockRejectedValue(new RecoveryValidationError('backup not found'));
    await expect(service.restore('acc', new Uint8Array([1]))).rejects.toBeInstanceOf(RecoveryValidationError);
  });

  it('restore triggers revoke flows on success', async () => {
    repo.getActiveBlob.mockResolvedValue({
      blobVersion: 1,
      profile: 'desktop',
      ciphertext: new Uint8Array([1]),
      nonce: new Uint8Array([2]),
      associatedData: new Uint8Array([3]),
      salt: new Uint8Array([4]),
      argonParams: { timeCost: 2, memoryCost: 8, parallelism: 1 }
    });
    const service = createRecoveryService(repo, { policy: defaultPolicy, backup: backupConfig, metrics }, deps);
    backupServiceStub.restore.mockResolvedValue({
      accountId: 'acc',
      blobVersion: 1,
      profile: 'desktop',
      payload: new Uint8Array([1]),
      argonParams: { timeCost: 2, memoryCost: 8, parallelism: 1 }
    });

    const result = await service.restore('acc', new Uint8Array([1, 2, 3]));
    expect(result.blobVersion).toBe(1);
    expect(deps.revokeTokens).toHaveBeenCalledWith('acc');
    expect(deps.revokeDevices).toHaveBeenCalledWith('acc', undefined);
  });

  it('audit returns recovery and blob state', async () => {
    repo.find.mockResolvedValue({ rcHash: 'hash', params: { ...defaultPolicy }, updatedAt: new Date() });
    backupServiceStub.listBlobs.mockResolvedValue([
      { id: 'active', isActive: true, updatedAt: new Date(), blobVersion: 1, profile: 'desktop', sizeBytes: 64 },
      { id: 'older', isActive: false, deletedAt: null, updatedAt: new Date(Date.now() - 1000), blobVersion: 0, profile: 'desktop', sizeBytes: 32 }
    ]);
    repo.listBlobs.mockResolvedValue([]);
    const service = createRecoveryService(repo, { policy: defaultPolicy, backup: backupConfig, metrics }, deps);
    const report = await service.audit('acc');
    expect(report.hasRecoveryRecord).toBe(true);
  });

  it('deactivateRestoreData deletes blobs not in keep list', async () => {
    backupServiceStub.listBlobs.mockResolvedValue([
      { id: 'keep', isActive: false },
      { id: 'drop', isActive: false }
    ]);
    const service = createRecoveryService(repo, { policy: defaultPolicy, backup: backupConfig, metrics }, deps);
    await service.deactivateRestoreData('acc', ['keep']);
    expect(backupServiceStub.deleteBlob).toHaveBeenCalledWith('drop');
  });

  it('rotate resets record and creates new backup', async () => {
    const service = createRecoveryService(repo, { policy: defaultPolicy, backup: backupConfig, metrics }, deps);
    backupServiceStub.createBackup.mockResolvedValue('blob-id');
    backupServiceStub.deactivateBlobs.mockResolvedValue(undefined);
    backupServiceStub.listBlobs.mockResolvedValue([
      { id: 'active', isActive: true, updatedAt: new Date(), blobVersion: 1, profile: 'desktop', sizeBytes: 64 }
    ]);

    await service.rotate('acc', 'code', {
      accountId: 'acc',
      blobVersion: 1,
      ciphertext: new Uint8Array([1]),
      nonce: new Uint8Array([2]),
      associatedData: new Uint8Array([3]),
      salt: new Uint8Array([4]),
      argonParams: { timeCost: 2, memoryCost: 1024, parallelism: 1 },
      profile: 'desktop',
      cipherLength: 1,
      padLength: 0
    });
    expect(repo.delete).toHaveBeenCalledWith('acc');
    expect(backupServiceStub.deactivateBlobs).toHaveBeenCalledWith('acc');
    expect(backupServiceStub.createBackup).toHaveBeenCalled();
  });
});
