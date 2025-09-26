import type { Pool } from 'pg';
import type { RefreshToken } from '../../domain/entities/tokens';
import type { CreateRefreshTokenInput, TokensRepository } from '../../repositories/tokensRepo';

const toToken = (row: any): RefreshToken => ({
  id: row.id,
  accountId: row.account_id,
  deviceId: row.device_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at ?? undefined,
  userAgent: row.user_agent ?? undefined,
  ip: row.ip ?? undefined
});

export const createPostgresTokensRepository = (pool: Pool): TokensRepository => ({
  async create(input: CreateRefreshTokenInput) {
    const result = await pool.query(
      `INSERT INTO auth.refresh_tokens (id, account_id, device_id, created_at, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, account_id, device_id, created_at, expires_at, revoked_at, user_agent, ip`,
      [
        input.id,
        input.accountId,
        input.deviceId,
        input.createdAt,
        input.expiresAt,
        input.userAgent ?? null,
        input.ip ?? null
      ]
    );
    return toToken(result.rows[0]);
  },

  async findById(id) {
    const result = await pool.query(
      'SELECT id, account_id, device_id, created_at, expires_at, revoked_at, user_agent, ip FROM auth.refresh_tokens WHERE id = $1',
      [id]
    );
    const row = result.rows[0];
    return row ? toToken(row) : null;
  },

  async revoke(id) {
    await pool.query('UPDATE auth.refresh_tokens SET revoked_at = now() WHERE id = $1', [id]);
  },

  async revokeAllForDevice(deviceId) {
    await pool.query('UPDATE auth.refresh_tokens SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL', [deviceId]);
  },

  async revokeAllForAccount(accountId) {
    await pool.query('UPDATE auth.refresh_tokens SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL', [accountId]);
  }
});
