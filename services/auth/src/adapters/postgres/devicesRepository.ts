import type { Pool } from 'pg';
import type { Device } from '../../domain/entities/device';
import type { DevicesRepository, CreateDeviceInput } from '../../repositories/devicesRepo';

type DeviceRow = {
  id: string;
  account_id: string;
  public_key: string;
  display_name: string | null;
  status: Device['status'];
  created_at: Date;
  last_seen_at: Date | null;
};

const toDevice = (row: DeviceRow): Device => ({
  id: row.id,
  accountId: row.account_id,
  publicKey: row.public_key,
  displayName: row.display_name ?? undefined,
  status: row.status,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at ?? undefined
});

export const createPostgresDevicesRepository = (pool: Pool): DevicesRepository => ({
  async create(input: CreateDeviceInput) {
    const result = await pool.query(
      `INSERT INTO auth.devices (account_id, public_key, display_name, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, account_id, public_key, display_name, status, created_at, last_seen_at`,
      [input.accountId, input.publicKey, input.displayName ?? null, input.status]
    );
    return toDevice(result.rows[0]);
  },

  async findById(id) {
    const result = await pool.query(
      'SELECT id, account_id, public_key, display_name, status, created_at, last_seen_at FROM auth.devices WHERE id = $1',
      [id]
    );
    const row = result.rows[0];
    return row ? toDevice(row) : null;
  },

  async findByAccount(accountId: string) {
    const result = await pool.query(
      'SELECT id, account_id, public_key, display_name, status, created_at, last_seen_at FROM auth.devices WHERE account_id = $1',
      [accountId]
    );
    return result.rows.map(toDevice);
  },

  async update(id, patch) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (patch.displayName !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(patch.displayName);
    }
    if (patch.status) {
      fields.push(`status = $${idx++}`);
      values.push(patch.status);
    }
    if (patch.lastSeenAt) {
      fields.push(`last_seen_at = $${idx++}`);
      values.push(patch.lastSeenAt);
    }
    if (!fields.length) return;
    values.push(id);
    await pool.query(`UPDATE auth.devices SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  },

  async countActiveForAccount(accountId) {
    const result = await pool.query(
      'SELECT count(*)::int AS count FROM auth.devices WHERE account_id = $1 AND status = $2',
      [accountId, 'active']
    );
    return result.rows[0]?.count ?? 0;
  }
});
