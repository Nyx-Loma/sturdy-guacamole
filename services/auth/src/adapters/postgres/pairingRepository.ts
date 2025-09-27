import type { Pool } from 'pg';
import type { PairingToken } from '../../domain/entities/pairing';
import type { CreatePairingTokenInput, PairingRepository } from '../../repositories/pairingRepo';

type PairingRow = {
  token: string;
  account_id: string;
  primary_device_id: string;
  nonce: string;
  created_at: Date;
  expires_at: Date;
  used: boolean;
  used_at: Date | null;
  new_device_public_key: string | null;
  pending_display_name: string | null;
};

const toPairing = (row: PairingRow): PairingToken => ({
  token: row.token,
  accountId: row.account_id,
  primaryDeviceId: row.primary_device_id,
  nonce: row.nonce,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  used: row.used,
  usedAt: row.used_at ?? undefined,
  pendingPublicKey: row.new_device_public_key ?? undefined,
  pendingDisplayName: row.pending_display_name ?? undefined
});

export const createPostgresPairingRepository = (pool: Pool): PairingRepository => ({
  async create(input: CreatePairingTokenInput) {
    const result = await pool.query(
      `INSERT INTO auth.pairing_tokens (token, account_id, primary_device_id, nonce, created_at, expires_at, used, new_device_public_key, pending_display_name)
       VALUES ($1, $2, $3, $4, $5, $6, false, NULL, NULL)
       RETURNING token, account_id, primary_device_id, nonce, created_at, expires_at, used, NULL::TIMESTAMPTZ AS used_at, new_device_public_key, pending_display_name`,
      [
        input.token,
        input.accountId,
        input.primaryDeviceId,
        input.nonce,
        input.createdAt,
        input.expiresAt
      ]
    );
    return toPairing(result.rows[0]);
  },

  async findByToken(token) {
    const result = await pool.query(
      `SELECT token, account_id, primary_device_id, nonce, created_at, expires_at, used, NULL::TIMESTAMPTZ AS used_at, new_device_public_key, pending_display_name
       FROM auth.pairing_tokens WHERE token = $1`,
      [token]
    );
    const row = result.rows[0];
    return row ? toPairing(row) : null;
  },

  async update(token, record) {
    await pool.query(
      `UPDATE auth.pairing_tokens
         SET new_device_public_key = $2,
             pending_display_name = $3
       WHERE token = $1`,
      [token, record.pendingPublicKey ?? null, record.pendingDisplayName ?? null]
    );
  },

  async markUsed(token) {
    await pool.query('UPDATE auth.pairing_tokens SET used = true WHERE token = $1', [token]);
  }
});
