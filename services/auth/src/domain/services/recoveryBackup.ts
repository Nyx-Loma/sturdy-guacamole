import { randomBytes, randomUUID } from 'node:crypto';
import type { RecoveryBlobRecord } from '../entities/recovery';
import type { RecoveryRepository } from '../../repositories/recoveryRepo';

export interface RecoveryBackupConfig {
  dummyCipherBytes: number;
  dummyNonceBytes: number;
  dummySaltBytes: number;
  dummyAssociatedDataBytes: number;
  dummyArgon: {
    timeCost: number;
    memoryCost: number;
    parallelism: number;
  };
}

export interface CreateBackupInput {
  accountId: string;
  blobVersion: number;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  associatedData: Uint8Array;
  salt: Uint8Array;
  argonParams: {
    timeCost: number;
    memoryCost: number;
    parallelism: number;
  };
  cipherLength: number;
  padLength: number;
  verifier?: Uint8Array | null;
}

export interface PreparePayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  associatedData: Uint8Array;
  salt: Uint8Array;
  argonParams: {
    timeCost: number;
    memoryCost: number;
    parallelism: number;
  };
  cipherLength: number;
  padLength: number;
  blobVersion: number;
}

export interface PrepareResult {
  payload: PreparePayload;
  blobId?: string;
  createdAt?: Date;
  isDummy: boolean;
}

const bufferFrom = (value: Uint8Array) =>
  value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(value as any);

export const createRecoveryBackupService = (
  repo: RecoveryRepository,
  config: RecoveryBackupConfig
) => {
  let cachedDummy: PreparePayload | undefined;

  const buildDummyPayload = (): PreparePayload => {
    if (cachedDummy) {
      return cachedDummy;
    }

    const ciphertext = randomBytes(config.dummyCipherBytes);
    const nonce = randomBytes(config.dummyNonceBytes);
    const associatedData = randomBytes(config.dummyAssociatedDataBytes);
    const salt = randomBytes(config.dummySaltBytes);

    cachedDummy = {
      ciphertext,
      nonce,
      associatedData,
      salt,
      argonParams: { ...config.dummyArgon },
      cipherLength: config.dummyCipherBytes,
      padLength: 0,
      blobVersion: 0
    };

    return cachedDummy;
  };

  const createBackup = async (input: CreateBackupInput) => {
    await repo.deactivateBlobs(input.accountId);

    const record: RecoveryBlobRecord = {
      id: randomUUID(),
      accountId: input.accountId,
      blobVersion: input.blobVersion,
      ciphertext: bufferFrom(input.ciphertext),
      nonce: bufferFrom(input.nonce),
      associatedData: bufferFrom(input.associatedData),
      salt: bufferFrom(input.salt),
      argonParams: { ...input.argonParams },
      cipherLength: input.cipherLength,
      padLength: input.padLength,
      verifier: input.verifier ? bufferFrom(input.verifier) : null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await repo.createBlob(record);
    return record.id;
  };

  const getStatus = async (accountId: string) => {
    const blob = await repo.getActiveBlob(accountId);
    if (!blob) {
      return { hasBackup: false as const };
    }
    return {
      hasBackup: true as const,
      blobVersion: blob.blobVersion,
      updatedAt: blob.updatedAt
    };
  };

  const prepare = async (accountId: string | null): Promise<PrepareResult> => {
    if (!accountId) {
      return { payload: buildDummyPayload(), isDummy: true };
    }

    const blob = await repo.getActiveBlob(accountId);
    if (!blob) {
      return { payload: buildDummyPayload(), isDummy: true };
    }

    return {
      payload: {
        ciphertext: blob.ciphertext,
        nonce: blob.nonce,
        associatedData: blob.associatedData,
        salt: blob.salt,
        argonParams: { ...blob.argonParams },
        cipherLength: blob.cipherLength,
        padLength: blob.padLength,
        blobVersion: blob.blobVersion
      },
      blobId: blob.id,
      createdAt: blob.createdAt,
      isDummy: false
    };
  };

  return {
    createBackup,
    getStatus,
    prepare
  };
};
