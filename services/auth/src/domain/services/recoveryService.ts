import argon2 from 'argon2';
import type { RecoveryRepository } from '../../repositories/recoveryRepo';
import { InvalidRecoveryCodeError, NotFoundError } from '../errors';
import type { RecoveryRecord } from '../entities/recovery';
import { createRecoveryBackupService, type RecoveryBackupConfig } from './recoveryBackup';
import { AuthMetrics } from '../metrics';

type RecoveryPolicy = {
  timeCost: number;
  memoryCost: number;
  parallelism: number;
  version: number;
};

export type RecoveryServiceConfig = {
  policy: RecoveryPolicy;
  backup: RecoveryBackupConfig;
  metrics: AuthMetrics;
};

interface RestoreDependencies {
  revokeTokens(accountId: string): Promise<void>;
  revokeDevices(accountId: string, exceptDeviceId?: string): Promise<void>;
}

export const createRecoveryService = (
  repo: RecoveryRepository,
  { policy, backup, metrics }: RecoveryServiceConfig,
  deps: RestoreDependencies
) => {
  const hash = async (code: string) =>
    argon2.hash(code, {
      type: argon2.argon2id,
      timeCost: policy.timeCost,
      memoryCost: policy.memoryCost,
      parallelism: policy.parallelism
    });

  const setup = async (accountId: string, code: string) => {
    if (policy.memoryCost < 16384 || policy.timeCost < 2) {
      throw new Error('argon2 parameters below policy baseline');
    }
    const rcHash = await hash(code);
    const record: RecoveryRecord = {
      accountId,
      rcHash,
      params: {
        timeCost: policy.timeCost,
        memoryCost: policy.memoryCost,
        parallelism: policy.parallelism,
        version: policy.version
      },
      updatedAt: new Date()
    };
    await repo.upsert(record);
  };

  const verify = async (accountId: string, code: string) => {
    const record = await repo.find(accountId);
    if (!record) throw new NotFoundError('recovery record not found');
    if (record.params.version !== policy.version) {
      throw new Error('recovery code requires rehash');
    }
    return argon2.verify(record.rcHash, code);
  };

  const consume = async (accountId: string, code: string) => {
    let ok: boolean;
    try {
      ok = await verify(accountId, code);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new InvalidRecoveryCodeError();
      }
      throw error;
    }
    if (!ok) {
      throw new InvalidRecoveryCodeError();
    }
    await repo.delete(accountId);
    return true;
  };

  const backupService = createRecoveryBackupService(repo, backup, metrics);
  const repoForDeactivate = repo;

  const restore = async (accountId: string, mrc: Uint8Array, options?: { keepDeviceId?: string }) => {
    try {
      const result = await backupService.restore({ accountId, mrc });
      await deps.revokeTokens(accountId);
      await deps.revokeDevices(accountId, options?.keepDeviceId);
      return result;
    } catch (error) {
      metrics.recordBackup('restore', 'fail');
      throw error;
    }
  };

  const deactivateRestoreData = async (accountId: string, keepBlobIds: string[] = []) => {
    const blobs = await backupService.listBlobs(accountId);
    const toDelete = blobs.filter((blob) => !keepBlobIds.includes(blob.id));
    await Promise.all(toDelete.map((blob) => backupService.deleteBlob(blob.id)));
  };

  const audit = async (accountId: string) => {
    const [record, blobs] = await Promise.all([repo.find(accountId), backupService.listBlobs(accountId)]);
    const active = blobs.find((blob) => blob.isActive);
    const previous = blobs.filter((blob) => !blob.isActive && !blob.deletedAt).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return {
      hasRecoveryRecord: Boolean(record),
      recordUpdatedAt: record?.updatedAt,
      activeBlob: active
        ? {
            id: active.id,
            updatedAt: active.updatedAt,
            version: active.blobVersion,
            profile: active.profile,
            argon: active.argonParams,
            sizeBytes: active.sizeBytes
          }
        : null,
      inactiveBlobs: previous.map((blob) => ({
        id: blob.id,
        updatedAt: blob.updatedAt,
        version: blob.blobVersion,
        profile: blob.profile,
        sizeBytes: blob.sizeBytes
      }))
    };
  };

  const rotate = async (accountId: string, code: string, backupInput: Parameters<typeof backupService.createBackup>[0]) => {
    await repo.delete(accountId);
    await repoForDeactivate.deactivateBlobs(accountId);
    await backupService.deactivateBlobs(accountId);
    await setup(accountId, code);
    await backupService.createBackup(backupInput);
    return audit(accountId);
  };

  return {
    setup,
    verify,
    consume,
    restore,
    deactivateRestoreData,
    audit,
    rotate,
    backup: backupService
  };
};


