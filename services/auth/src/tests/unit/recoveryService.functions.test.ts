import { describe, it, expect, vi } from 'vitest';
import { createRecoveryService } from '../../domain/services/recoveryService';

const repo = {
  find: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deactivateBlobs: vi.fn()
} as any;

const metrics = { recordBackup: vi.fn() } as any;

const baseConfig = {
  policy: { timeCost: 2, memoryCost: 16384, parallelism: 1, version: 1 },
  backup: {
    dummyCipherBytes: 1,
    dummyNonceBytes: 1,
    dummySaltBytes: 1,
    dummyAssociatedDataBytes: 1,
    dummyArgon: { timeCost: 1, memoryCost: 1, parallelism: 1 },
    minLatencyMs: 0,
    argonFloor: { memoryDesktop: 1, memoryMobile: 1, timeCost: 1, parallelism: 1 },
    retainBlobs: 1,
    kmsPepper: undefined
  },
  metrics
} as any;

describe('recoveryService function paths', () => {
  it('setup stores record using policy values', async () => {
    const svc = createRecoveryService(repo, baseConfig, { revokeTokens: vi.fn(), revokeDevices: vi.fn() });
    await svc.setup('acc', 'code');
    expect(repo.upsert).toHaveBeenCalled();
  });

  it('deactivateRestoreData deletes inactive blobs', async () => {
    const svc = createRecoveryService(repo, baseConfig, { revokeTokens: vi.fn(), revokeDevices: vi.fn() });
    vi.spyOn(svc.backup, 'listBlobs').mockResolvedValue([
      { id: '1', isActive: true, deletedAt: null },
      { id: '2', isActive: false, deletedAt: null },
      { id: '3', isActive: false, deletedAt: new Date() }
    ] as any);
    const delSpy = vi.spyOn(svc.backup, 'deleteBlob').mockResolvedValue();
    await svc.deactivateRestoreData('acc');
    expect(delSpy).toHaveBeenCalledWith('2');
  });
});


