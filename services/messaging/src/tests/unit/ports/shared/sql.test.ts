import { describe, expect, test, vi } from 'vitest';

import { inTransaction } from '../../../../ports/shared/sql';

const createMockSql = () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql === 'ROLLBACK' && calls.at(-2)?.sql !== 'BEGIN') {
      throw new Error('rollback without begin');
    }
    return { rows: [] };
  });

  return { query };
};

describe('inTransaction helper', () => {
  test('commits when callback succeeds', async () => {
    const sql = createMockSql();

    const result = await inTransaction(sql, async (client) => {
      await client.query('SELECT 1');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(sql.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(sql.query).toHaveBeenNthCalledWith(2, 'SELECT 1');
    expect(sql.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(sql.query).toHaveBeenCalledTimes(3);
  });

  test('rolls back when callback throws', async () => {
    const sql = createMockSql();

    await expect(
      inTransaction(sql, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(sql.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(sql.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(sql.query).toHaveBeenCalledTimes(2);
  });

  test('propagates client usage outside transaction body', async () => {
    const sql = createMockSql();

    await inTransaction(sql, async (client) => {
      await client.query('INSERT INTO messages VALUES ($1)', ['payload']);
    });

    expect(sql.query).toHaveBeenNthCalledWith(2, 'INSERT INTO messages VALUES ($1)', ['payload']);
  });
});

