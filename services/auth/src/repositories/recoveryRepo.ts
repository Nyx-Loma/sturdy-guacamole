import type { RecoveryBlobRecord, RecoveryRecord } from '../domain/entities/recovery';

export interface RecoveryRepository {
  upsert(record: RecoveryRecord): Promise<void>;
  find(accountId: string): Promise<RecoveryRecord | null>;
  delete(accountId: string): Promise<void>;
  createBlob(record: RecoveryBlobRecord): Promise<void>;
  getActiveBlob(accountId: string): Promise<RecoveryBlobRecord | null>;
  getPreviousBlob(accountId: string): Promise<RecoveryBlobRecord | null>;
  getBlobById(id: string): Promise<RecoveryBlobRecord | null>;
  listBlobs(accountId: string): Promise<RecoveryBlobRecord[]>;
  deleteBlob(id: string): Promise<void>;
  deactivateBlobs(accountId: string): Promise<void>;
}


