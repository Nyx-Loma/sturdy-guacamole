import type { Pool } from 'pg';
import type { RecoveryBlobRecord, RecoveryRecord } from '../../domain/entities/recovery';
import type { RecoveryRepository } from '../../repositories/recoveryRepo';

const toRecord = (row: any): RecoveryRecord => ({
  accountId: row.account_id,
  rcHash: row.rc_hash,
  params: row.params,
  updatedAt: row.updated_at
});

const toBlobRecord = (row: any): RecoveryBlobRecord => ({
  id: row.id,
  accountId: row.account_id,
  blobVersion: row.blob_version,
  ciphertext: row.ciphertext,
  nonce: row.nonce,
  associatedData: row.associated_data,
  salt: row.salt,
  argonParams: row.argon_params,
  cipherLength: row.cipher_length,
  padLength: row.pad_length,
  verifier: row.verifier,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at ?? undefined
});

export const createPostgresRecoveryRepository = (pool: Pool): RecoveryRepository => ({
  async upsert(record) {
    await pool.query(
      `INSERT INTO auth.recovery (account_id, rc_hash, params, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (account_id) DO UPDATE SET
         rc_hash = excluded.rc_hash,
         params = excluded.params,
         updated_at = now()`
      , [record.accountId, record.rcHash, record.params]
    );
  },

  async find(accountId) {
    const result = await pool.query(
      'SELECT account_id, rc_hash, params, updated_at FROM auth.recovery WHERE account_id = $1',
      [accountId]
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  },

  async delete(accountId) {
    await pool.query('DELETE FROM auth.recovery WHERE account_id = $1', [accountId]);
  },

  async deactivateBlobs(accountId) {
    await pool.query(
      'UPDATE auth.recovery_blobs SET is_active = FALSE, updated_at = now() WHERE account_id = $1 AND is_active = TRUE',
      [accountId]
    );
  },

  async createBlob(record) {
    await pool.query(
      `INSERT INTO auth.recovery_blobs (
        id, account_id, blob_version, ciphertext, nonce, associated_data, salt,
        argon_params, cipher_length, pad_length, verifier, is_active, created_at, updated_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, now(), now(), $13
      )`,
      [
        record.id,
        record.accountId,
        record.blobVersion,
        record.ciphertext,
        record.nonce,
        record.associatedData,
        record.salt,
        record.argonParams,
        record.cipherLength,
        record.padLength,
        record.verifier ?? null,
        record.isActive,
        record.deletedAt ?? null
      ]
    );
  },

  async getActiveBlob(accountId) {
    const result = await pool.query(
      `SELECT * FROM auth.recovery_blobs WHERE account_id = $1 AND is_active = TRUE LIMIT 1`,
      [accountId]
    );
    const row = result.rows[0];
    return row ? toBlobRecord(row) : null;
  },

  async getBlobById(id) {
    const result = await pool.query(`SELECT * FROM auth.recovery_blobs WHERE id = $1 LIMIT 1`, [id]);
    const row = result.rows[0];
    return row ? toBlobRecord(row) : null;
  }
});

