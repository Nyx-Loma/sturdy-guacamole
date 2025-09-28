import type { Pool } from 'pg';
import type { RecoveryBlobRecord, RecoveryRecord } from '../../domain/entities/recovery';
import type { RecoveryRepository } from '../../repositories/recoveryRepo';

type RecoveryRow = {
  account_id: string;
  rc_hash: string;
  params: RecoveryRecord['params'];
  updated_at: Date;
};

type RecoveryBlobRow = {
  id: string;
  account_id: string;
  blob_version: number;
  ciphertext: Buffer;
  nonce: Buffer;
  associated_data: Buffer;
  salt: Buffer;
  argon_params: RecoveryBlobRecord['argonParams'];
  profile: RecoveryBlobRecord['profile'];
  cipher_length: number;
  pad_length: number;
  verifier: Buffer | null;
  kek_verifier: Buffer | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  previous_blob_id: string | null;
  size_bytes: number | null;
};

const toRecord = (row: RecoveryRow): RecoveryRecord => ({
  accountId: row.account_id,
  rcHash: row.rc_hash,
  params: row.params,
  updatedAt: row.updated_at
});

const toUint8 = (value: Buffer | null | undefined) => (value ? new Uint8Array(value) : value ?? undefined);

const toBlobRecord = (row: RecoveryBlobRow): RecoveryBlobRecord => ({
  id: row.id,
  accountId: row.account_id,
  blobVersion: row.blob_version,
  ciphertext: new Uint8Array(row.ciphertext),
  nonce: new Uint8Array(row.nonce),
  associatedData: new Uint8Array(row.associated_data),
  salt: new Uint8Array(row.salt),
  argonParams: row.argon_params,
  profile: row.profile,
  cipherLength: row.cipher_length,
  padLength: row.pad_length,
  verifier: toUint8(row.verifier) ?? null,
  kekVerifier: toUint8(row.kek_verifier) ?? null,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at ?? undefined,
  previousBlobId: row.previous_blob_id ?? null,
  sizeBytes: row.size_bytes ?? undefined
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
      argon_params, profile, cipher_length, pad_length, verifier, kek_verifier, is_active, created_at, updated_at, deleted_at,
      previous_blob_id, size_bytes
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19
    )
    ON CONFLICT (id) DO UPDATE SET
      blob_version = EXCLUDED.blob_version,
      ciphertext = EXCLUDED.ciphertext,
      nonce = EXCLUDED.nonce,
      associated_data = EXCLUDED.associated_data,
      salt = EXCLUDED.salt,
      argon_params = EXCLUDED.argon_params,
      profile = EXCLUDED.profile,
      cipher_length = EXCLUDED.cipher_length,
      pad_length = EXCLUDED.pad_length,
      verifier = EXCLUDED.verifier,
      kek_verifier = EXCLUDED.kek_verifier,
      is_active = EXCLUDED.is_active,
      updated_at = now(),
      deleted_at = EXCLUDED.deleted_at,
      previous_blob_id = EXCLUDED.previous_blob_id,
      size_bytes = EXCLUDED.size_bytes
    `,
    [
      record.id,
      record.accountId,
      record.blobVersion,
      record.ciphertext,
      record.nonce,
      record.associatedData,
      record.salt,
      record.argonParams,
      record.profile,
      record.cipherLength,
      record.padLength,
      record.verifier ?? null,
      record.kekVerifier ?? null,
      record.isActive,
      record.createdAt ?? new Date(),
      record.updatedAt ?? new Date(),
      record.deletedAt ?? null,
      record.previousBlobId ?? null,
      record.sizeBytes ?? null
    ]
  );
  },

  async getActiveBlob(accountId) {
    const result = await pool.query(
      `SELECT * FROM auth.recovery_blobs WHERE account_id = $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1`,
      [accountId]
    );
    const row = result.rows[0];
    return row ? toBlobRecord(row) : null;
  },

  async getPreviousBlob(accountId) {
    const result = await pool.query(
      `SELECT * FROM auth.recovery_blobs
       WHERE account_id = $1 AND is_active = FALSE AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [accountId]
    );
    const row = result.rows[0];
    return row ? toBlobRecord(row) : null;
  },

  async getBlobById(id) {
    const result = await pool.query(`SELECT * FROM auth.recovery_blobs WHERE id = $1 LIMIT 1`, [id]);
    const row = result.rows[0];
    return row ? toBlobRecord(row) : null;
  },

  async listBlobs(accountId) {
    const result = await pool.query(
      `SELECT * FROM auth.recovery_blobs WHERE account_id = $1 ORDER BY created_at DESC`,
      [accountId]
    );
    return result.rows.map(toBlobRecord);
  },

  async deleteBlob(id) {
    await pool.query('DELETE FROM auth.recovery_blobs WHERE id = $1', [id]);
  }
});

