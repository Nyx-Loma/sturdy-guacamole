import type { Pool } from 'pg';
import type { Account, AccountStatus } from '../../domain/entities/account';
import type { AccountsRepository } from '../../repositories/accountsRepo';

export const createPostgresAccountsRepository = (pool: Pool): AccountsRepository => {
  const toAccount = (row: any): Account => ({
    id: row.id,
    createdAt: row.created_at,
    status: row.status as AccountStatus
  });

  return {
    async createAnonymous() {
      const result = await pool.query(
        'INSERT INTO auth.accounts (status) VALUES ($1) RETURNING id, created_at, status',
        ['active']
      );
      return toAccount(result.rows[0]);
    },

    async findById(id) {
      const result = await pool.query('SELECT id, created_at, status FROM auth.accounts WHERE id = $1', [id]);
      const row = result.rows[0];
      return row ? toAccount(row) : null;
    },

    async updateStatus(id, status) {
      await pool.query('UPDATE auth.accounts SET status = $2 WHERE id = $1', [id, status]);
    }
  };
};
