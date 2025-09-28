import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import type { RecoveryBlobRecord } from '../entities/recovery';
import type { RecoveryRepository } from '../../repositories/recoveryRepo';
import { AuthMetrics } from '../metrics';
import { RecoveryPolicyError, RecoveryValidationError } from '../errors';
import { deriveMaterial } from '@sanctum/crypto/backup/derive';
import { createCryptoProvider, brandCipherText, brandNonce, brandSymmetricKey } from '@sanctum/crypto';

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
  minLatencyMs: number;
  argonFloor: {
    memoryDesktop: number;
    memoryMobile: number;
    timeCost: number;
    parallelism: number;
  };
  kmsPepper?: Uint8Array;
  retainBlobs?: number;
}

export type ArgonProfile = 'desktop' | 'mobile';

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
  profile: ArgonProfile;
  cipherLength: number;
  padLength: number;
  previousBlobId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  mrc?: Uint8Array;
  associatedDataOverride?: Uint8Array;
  plaintextNonce?: Uint8Array;
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
  latencyFloorMs: number;
  profile: ArgonProfile;
}

export interface PrepareResult {
  payload: PreparePayload;
  blobId?: string;
  createdAt?: Date;
  sizeBytes: number;
  isDummy: boolean;
  verifier?: string;
}

export interface RestoreInput {
  accountId: string;
  mrc: Uint8Array;
  blobId?: string;
}

export interface RestoreResult {
  accountId: string;
  blobVersion: number;
  profile: ArgonProfile;
  payload: Uint8Array;
  argonParams: RecoveryBlobRecord['argonParams'];
}

const bufferFrom = (value: Uint8Array | Buffer) =>
  value instanceof Uint8Array ? Buffer.from(value) : value;

const toUint8 = (value: Uint8Array | Buffer) =>
  value instanceof Uint8Array ? value : new Uint8Array(value);

const computeSize = (payload: PreparePayload) =>
  payload.cipherLength + payload.padLength + payload.nonce.length + payload.associatedData.length + payload.salt.length;

const encodeBase64Url = (value: Uint8Array) => Buffer.from(value).toString('base64url');

const provider = createCryptoProvider();

const enforceArgonFloor = (cfg: RecoveryBackupConfig, params: CreateBackupInput['argonParams'], profile: ArgonProfile) => {
  const minMemory = profile === 'desktop' ? cfg.argonFloor.memoryDesktop : cfg.argonFloor.memoryMobile;
  if (params.memoryCost < minMemory) {
    throw new RecoveryPolicyError('argon memory cost below policy floor');
  }
  if (params.timeCost < cfg.argonFloor.timeCost) {
    throw new RecoveryPolicyError('argon time cost below policy floor');
  }
  if (params.parallelism < cfg.argonFloor.parallelism) {
    throw new RecoveryPolicyError('argon parallelism below policy floor');
  }
};

const applyLatencyFloor = async (startedAt: number, floorMs: number) => {
  const elapsed = Date.now() - startedAt;
  if (elapsed >= floorMs) return;
    await new Promise((resolve) => setTimeout(resolve, floorMs - elapsed));
};

export const createRecoveryBackupService = (
  repo: RecoveryRepository,
  config: RecoveryBackupConfig,
  metrics: AuthMetrics
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
      blobVersion: 0,
      latencyFloorMs: config.minLatencyMs,
      profile: 'desktop'
    };

    return cachedDummy;
  };

  const createBackup = async (input: CreateBackupInput) => {
    const startedAt = Date.now();
    if (!['desktop', 'mobile'].includes(input.profile)) {
      throw new RecoveryValidationError('invalid argon profile');
    }
    enforceArgonFloor(config, input.argonParams, input.profile);
    await repo.deactivateBlobs(input.accountId);

    const derived = input.mrc
      ? await deriveMaterial(input.mrc, { salt: input.salt })
      : undefined;
    const kek = derived ? brandSymmetricKey(derived.kek) : undefined;
    const nonceBytes = derived?.keyNonce
      ? brandNonce(toUint8(derived.keyNonce))
      : input.plaintextNonce
        ? brandNonce(toUint8(input.plaintextNonce))
        : brandNonce(await provider.randomBytes(24));
    const additionalData = input.associatedDataOverride ?? input.associatedData;

    let ciphertext = brandCipherText(toUint8(input.ciphertext));
    let kekVerifier: Uint8Array | null = null;
    if (kek) {
      ciphertext = await provider.encrypt(kek, ciphertext, nonceBytes, { additionalData });
      if (config.kmsPepper) {
        const hmac = createHmac('sha256', config.kmsPepper);
        hmac.update(Buffer.from(ciphertext));
        kekVerifier = new Uint8Array(hmac.digest());
      }
    }
    const verifier = derived?.verifierSeed ?? null;

    const cipherLength = ciphertext.length;
    const sizeBytes = cipherLength + input.padLength + nonceBytes.length + additionalData.length + input.salt.length;

    const record: RecoveryBlobRecord = {
      id: input.previousBlobId ?? randomUUID(),
      accountId: input.accountId,
      blobVersion: input.blobVersion,
      ciphertext,
      nonce: nonceBytes,
      associatedData: additionalData,
      salt: toUint8(input.salt),
      argonParams: {
        timeCost: input.argonParams.timeCost,
        memoryCost: input.argonParams.memoryCost,
        parallelism: input.argonParams.parallelism
      },
      profile: input.profile,
      cipherLength,
      padLength: input.padLength,
      verifier: verifier ? bufferFrom(verifier) : null,
      kekVerifier: kekVerifier ? bufferFrom(kekVerifier) : null,
      isActive: true,
      createdAt: input.createdAt ?? new Date(),
      updatedAt: input.updatedAt ?? new Date(),
      deletedAt: null,
      previousBlobId: input.previousBlobId ?? null,
      sizeBytes
    };

    await repo.createBlob(record);
    metrics.recordBackup('submit', 'ok', sizeBytes);
    metrics.observeBackupLatency('submit', Date.now() - startedAt);
    if (config.retainBlobs !== undefined) {
      const blobs = await repo.listBlobs(input.accountId);
      const toDelete = blobs
        .filter((blob) => blob.id !== record.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(config.retainBlobs);
      await Promise.all(toDelete.map((blob) => repo.deleteBlob(blob.id)));
    }
    return record.id;
  };

  const getStatus = async (accountId: string) => {
    const [active, previous] = await Promise.all([
      repo.getActiveBlob(accountId),
      repo.getPreviousBlob(accountId)
    ]);
    if (!active) {
      return { hasBackup: false as const };
    }
    return {
      hasBackup: true as const,
      blobVersion: active.blobVersion,
      updatedAt: active.updatedAt,
      previousBlobId: previous?.id ?? null
    };
  };

  const prepare = async (accountId: string | null): Promise<PrepareResult> => {
    const started = Date.now();
    try {
      if (!accountId) {
        const payload = buildDummyPayload();
        const size = computeSize(payload);
        metrics.recordBackup('prepare', 'ok', size);
        metrics.observeBackupLatency('prepare', Date.now() - started);
        return { payload, sizeBytes: size, isDummy: true };
      }

      const blob = await repo.getActiveBlob(accountId);
      if (!blob) {
        const payload = buildDummyPayload();
        const size = computeSize(payload);
        metrics.recordBackup('prepare', 'ok', size);
        metrics.observeBackupLatency('prepare', Date.now() - started);
        return { payload, sizeBytes: size, isDummy: true };
      }

      const payload: PreparePayload = {
        ciphertext: blob.ciphertext,
        nonce: blob.nonce,
        associatedData: blob.associatedData,
        salt: blob.salt,
        argonParams: { ...blob.argonParams },
        profile: blob.profile,
        cipherLength: blob.cipherLength,
        padLength: blob.padLength,
        blobVersion: blob.blobVersion,
        latencyFloorMs: config.minLatencyMs
      };
      const size = computeSize(payload);
      metrics.recordBackup('prepare', 'ok', size);
      metrics.observeBackupLatency('prepare', Date.now() - started);
      return {
        payload,
        blobId: blob.id,
        createdAt: blob.createdAt,
        sizeBytes: size,
        isDummy: false,
        verifier: blob.kekVerifier ? encodeBase64Url(blob.kekVerifier) : undefined
      };
    } finally {
      await applyLatencyFloor(started, config.minLatencyMs);
    }
  };

  const listBlobs = async (accountId: string) => repo.listBlobs(accountId);
  const deleteBlob = async (id: string) => repo.deleteBlob(id);

  const restore = async ({ accountId, mrc, blobId }: RestoreInput): Promise<RestoreResult> => {
    const started = Date.now();
    try {
      const record = blobId ? await repo.getBlobById(blobId) : await repo.getActiveBlob(accountId);
      if (!record) {
        throw new RecoveryValidationError('backup not found');
      }
      const derived = await deriveMaterial(mrc, { salt: record.salt });
      const kek = brandSymmetricKey(derived.kek);
      const plaintext = await provider.decrypt(
        kek,
        brandCipherText(toUint8(record.ciphertext)),
        brandNonce(toUint8(record.nonce)),
        { additionalData: record.associatedData }
      );
      const result = {
        accountId,
        blobVersion: record.blobVersion,
        profile: record.profile,
        payload: plaintext,
        argonParams: record.argonParams
      };
      metrics.recordBackup('restore', 'ok', plaintext.plaintext.length);
      metrics.observeBackupLatency('restore', Date.now() - started);
      return { ...result, payload: plaintext.plaintext };
    } catch {
      metrics.recordBackup('restore', 'fail', 0);
      metrics.observeBackupLatency('restore', Date.now() - started);
      throw new RecoveryValidationError('decryption failed');
    }
  };

  return {
    createBackup,
    getStatus,
    prepare,
    restore,
    listBlobs,
    deleteBlob
  };
};
