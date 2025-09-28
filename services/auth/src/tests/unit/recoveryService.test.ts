import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecoveryService } from '../../domain/services/recoveryService';
import { createInMemoryRecoveryRepository } from '../../adapters/inMemory/recoveryRepository';
import { InvalidRecoveryCodeError, NotFoundError } from '../../domain/errors';

const repoFactory = () => createInMemoryRecoveryRepository();

const metricsMock = {
  recordBackup: vi.fn(),
  observeBackupLatency: vi.fn()
};
const strongConfig = {
  policy: { timeCost: 2, memoryCost: 16384, parallelism: 1, version: 1 },
  backup: {
    dummyCipherBytes: 32,
    dummyNonceBytes: 12,
    dummySaltBytes: 16,
    dummyAssociatedDataBytes: 16,
    dummyArgon: { timeCost: 1, memoryCost: 8192, parallelism: 1 },
    minLatencyMs: 0,
    argonFloor: { memoryDesktop: 16384, memoryMobile: 16384, timeCost: 2, parallelism: 1 }
  },
  metrics: metricsMock as any
};
const noopDeps = {
  revokeTokens: vi.fn().mockResolvedValue(undefined),
  revokeDevices: vi.fn().mockResolvedValue(undefined)
};

const makeService = () => createRecoveryService(repoFactory(), strongConfig, noopDeps);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recovery service', () => {
  it('hashes and verifies recovery code', async () => {
    const service = makeService();
    await service.setup('acc', 'secret-code');
    const ok = await service.verify('acc', 'secret-code');
    expect(ok).toBe(true);
    const bad = await service.verify('acc', 'wrong');
    expect(bad).toBe(false);
  });

  it('overwrites existing recovery codes', async () => {
    const service = makeService();
    await service.setup('acc', 'old-code');
    await service.setup('acc', 'new-code');
    const ok = await service.verify('acc', 'new-code');
    expect(ok).toBe(true);
    const bad = await service.verify('acc', 'old-code');
    expect(bad).toBe(false);
  });

  it('consumes code on success and rejects reuse', async () => {
    const service = makeService();
    await service.setup('acc-consume', 'one-shot');
    await expect(service.consume('acc-consume', 'one-shot')).resolves.toBe(true);
    await expect(service.consume('acc-consume', 'one-shot')).rejects.toBeInstanceOf(InvalidRecoveryCodeError);
  });

  it('throws when record missing', async () => {
    const service = makeService();
    await expect(service.verify('missing', 'any')).rejects.toThrow(NotFoundError);
  });

  it('rejects verification if policy version changed', async () => {
    const repo = createInMemoryRecoveryRepository();
    const oldService = createRecoveryService(repo, {
      ...strongConfig,
      policy: { ...strongConfig.policy, version: 0 }
    }, noopDeps);
    await oldService.setup('acc', 'code');
    const newService = createRecoveryService(repo, strongConfig, noopDeps);
    await expect(newService.verify('acc', 'code')).rejects.toThrow('recovery code requires rehash');
  });

  it('marks restore failure and propagates error', async () => {
    const repo = createInMemoryRecoveryRepository();
    const service = createRecoveryService(repo, strongConfig, {
      revokeTokens: vi.fn(),
      revokeDevices: vi.fn()
    });
    const restoreSpy = vi.spyOn(service.backup, 'restore').mockRejectedValue(new Error('boom'));

    await expect(service.restore('acc', new Uint8Array([1, 2, 3]))).rejects.toThrow('boom');
    expect(metricsMock.recordBackup).toHaveBeenCalledWith('restore', 'fail');
    expect(restoreSpy).toHaveBeenCalled();
  });

  it('revokes tokens and devices on restore success', async () => {
    const repo = createInMemoryRecoveryRepository();
    const tokens = vi.fn();
    const devices = vi.fn();
    const service = createRecoveryService(repo, strongConfig, {
      revokeTokens: tokens,
      revokeDevices: devices
    });
    const restored = {
      accountId: 'acc',
      blobVersion: 1,
      profile: 'desktop' as const,
      payload: new Uint8Array([1, 2, 3]),
      argonParams: { timeCost: 1, memoryCost: 2, parallelism: 1 }
    };
    const restoreSpy = vi.spyOn(service.backup, 'restore').mockResolvedValue(restored as any);

    const result = await service.restore('acc', new Uint8Array([9]));
    expect(result).toEqual(restored);
    expect(restoreSpy).toHaveBeenCalledWith({ accountId: 'acc', mrc: new Uint8Array([9]) });
    expect(tokens).toHaveBeenCalledWith('acc');
    expect(devices).toHaveBeenCalledWith('acc', undefined);
  });
});


