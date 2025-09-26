import type { RecoveryBlobRecord, RecoveryRecord } from '../domain/entities/recovery';

export interface RecoveryRepository {
  upsert(record: RecoveryRecord): Promise<void>;
  find(accountId: string): Promise<RecoveryRecord | null>;
  delete(accountId: string): Promise<void>;
  createBlob(record: RecoveryBlobRecord): Promise<void>;
  getActiveBlob(accountId: string): Promise<RecoveryBlobRecord | null>;
  getBlobById(id: string): Promise<RecoveryBlobRecord | null>;
  deactivateBlobs(accountId: string): Promise<void>;
}


