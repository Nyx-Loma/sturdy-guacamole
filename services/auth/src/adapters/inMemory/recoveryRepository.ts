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
      blobStore.set(id, { ...record, id, createdAt, updatedAt });
    },

    async getActiveBlob(accountId) {
      for (const blob of blobStore.values()) {
        if (blob.accountId === accountId && blob.isActive) {
          return blob;
        }
      }
      return null;
    },

    async getBlobById(id) {
      return blobStore.get(id) ?? null;
    }
  };
};


