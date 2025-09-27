import { randomUUID } from 'node:crypto';
import type { RecoveryBlobRecord, RecoveryRecord } from '../../domain/entities/recovery';
import type { RecoveryRepository } from '../../repositories/recoveryRepo';

export const createInMemoryRecoveryRepository = (): RecoveryRepository => {
  const recoveryStore = new Map<string, RecoveryRecord>();
  const blobStore = new Map<string, RecoveryBlobRecord>();

  return {
    async upsert(record) {
      recoveryStore.set(record.accountId, record);
    },

    async find(accountId) {
      return recoveryStore.get(accountId) ?? null;
    },

    async delete(accountId) {
      recoveryStore.delete(accountId);
      for (const [id, blob] of blobStore.entries()) {
        if (blob.accountId === accountId) {
          blobStore.delete(id);
        }
      }
    },

    async deactivateBlobs(accountId) {
      for (const [id, blob] of blobStore.entries()) {
        if (blob.accountId === accountId && blob.isActive) {
          blobStore.set(id, { ...blob, isActive: false, updatedAt: new Date() });
        }
      }
    },

    async createBlob(record) {
      const id = record.id ?? randomUUID();
      const createdAt = record.createdAt ?? new Date();
      const updatedAt = record.updatedAt ?? createdAt;
      const existing = blobStore.get(id);
      const finalRecord: RecoveryBlobRecord = {
        ...record,
        id,
        createdAt,
        updatedAt,
        previousBlobId: record.previousBlobId ?? existing?.previousBlobId ?? null,
        sizeBytes: record.sizeBytes ?? existing?.sizeBytes
      };
      blobStore.set(id, finalRecord);
    },

    async getActiveBlob(accountId) {
      for (const blob of blobStore.values()) {
        if (blob.accountId === accountId && blob.isActive) {
          return blob;
        }
      }
      return null;
    },

    async getPreviousBlob(accountId) {
      let latest: RecoveryBlobRecord | null = null;
      for (const blob of blobStore.values()) {
        if (blob.accountId === accountId && !blob.isActive && !blob.deletedAt) {
          if (!latest || blob.updatedAt > latest.updatedAt) {
            latest = blob;
          }
        }
      }
      return latest;
    },

    async getBlobById(id) {
      return blobStore.get(id) ?? null;
    },

    async listBlobs(accountId) {
      return [...blobStore.values()].filter((blob) => blob.accountId === accountId);
    },

    async deleteBlob(id) {
      blobStore.delete(id);
    }
  };
};


