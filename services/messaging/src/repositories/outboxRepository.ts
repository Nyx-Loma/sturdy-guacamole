import type { Pool } from 'pg';

export interface OutboxRow {
  id: string;
  conversation_id: string;
  message_id: string;
  payload: unknown;
  attempts: number;
  picked_at: string | null;
  created_at: string;
  status: 'pending' | 'picked' | 'sent' | 'dead';
}

export interface OutboxRepository {
  fetchBatch(limit: number): Promise<OutboxRow[]>;
  markSent(ids: string[]): Promise<void>;
  markFailed(ids: string[], err: string): Promise<void>;
  bury(ids: string[], err: string): Promise<void>;
}

export const createOutboxRepository = (pool: Pool): OutboxRepository => {
  return {
    async fetchBatch(limit: number): Promise<OutboxRow[]> {
      const { rows } = await pool.query<OutboxRow>(
        `
        WITH picked AS (
          SELECT id
          FROM messaging.message_outbox
          WHERE status = 'pending'
          ORDER BY occurred_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE messaging.message_outbox o
        SET status = 'picked', picked_at = NOW(), attempts = o.attempts + 1
        FROM picked
        WHERE o.id = picked.id
        RETURNING 
          o.id::text, 
          o.aggregate_id::text AS conversation_id, 
          o.message_id::text, 
          o.payload, 
          o.attempts, 
          o.picked_at::text, 
          o.occurred_at::text AS created_at,
          o.status
      `,
        [limit]
      );
      return rows;
    },

    async markSent(ids: string[]): Promise<void> {
      if (!ids.length) return;
      await pool.query(
        `
        UPDATE messaging.message_outbox
        SET status = 'sent', dispatched_at = NOW(), last_error = NULL
        WHERE id = ANY($1::bigint[])
      `,
        [ids]
      );
    },

    async markFailed(ids: string[], err: string): Promise<void> {
      if (!ids.length) return;
      await pool.query(
        `
        UPDATE messaging.message_outbox
        SET status = 'pending', last_error = LEFT($2, 1000)
        WHERE id = ANY($1::bigint[])
      `,
        [ids, err]
      );
    },

    async bury(ids: string[], err: string): Promise<void> {
      if (!ids.length) return;
      await pool.query(
        `
        UPDATE messaging.message_outbox
        SET status = 'dead', last_error = LEFT($2, 1000)
        WHERE id = ANY($1::bigint[])
      `,
        [ids, err]
      );
    },
  };
};

