import { describe, expect, it } from 'vitest';

import {
  createPostgresMessagesWriteAdapter
} from '../../../../ports/messages/postgres/messagesWriteAdapter';
import { setupDatabaseTests } from '../../helpers/setupDatabase';

const baseInput = {
  conversationId: '6bdfc2c4-0fd3-4a46-8c7a-5ad1e5f8f364',
  senderId: '2e3d5163-8a07-4be6-80c1-56c6df4ac0e2',
  type: 'text' as const,
  encryptedContent: 'SGVsbG8=',
  metadata: { replyTo: null }
};

describe('PostgresMessagesWriteAdapter (integration)', () => {
  if (!process.env.DATABASE_URL) {
    it.skip('skipped: DATABASE_URL not configured');
    return;
  }

  const { client, available } = setupDatabaseTests(process.env.DATABASE_URL, {
    truncateTables: ['messaging.message_idempotency', 'messaging.messages']
  });

  const adapter = createPostgresMessagesWriteAdapter({
    sql: client,
    now: () => new Date('2025-09-29T12:00:00.000Z')
  });

  it.skipIf(!available)('creates messages and respects idempotency key', async () => {
    const command = { input: baseInput, idempotencyKey: 'client-1' };

    const id1 = await adapter.create(command);
    const rowsAfterFirst = await client.query('select * from messaging.messages where id = $1', [id1]);
    expect(rowsAfterFirst.rowCount).toBe(1);

    const id2 = await adapter.create(command);

    expect(id1).toBe(id2);

    const rows = await client.query('select * from messaging.messages where id = $1', [id1]);
    expect(rows.rowCount).toBe(1);
  });

  it.skipIf(!available)('updates status transitions', async () => {
    const id = await adapter.create({ input: baseInput });

    await adapter.updateStatus(id, 'delivered', '2025-09-29T12:01:00.000Z');
    await adapter.updateStatus(id, 'read', '2025-09-29T12:02:00.000Z');

    const { rows } = await client.query('select status, read_at, delivered_at from messaging.messages where id = $1', [id]);
    expect(rows[0]?.status).toBe('read');
    expect(new Date(rows[0]?.read_at).toISOString()).toBe('2025-09-29T12:02:00.000Z');
    expect(new Date(rows[0]?.delivered_at).toISOString()).toBe('2025-09-29T12:01:00.000Z');
  });

  it.skipIf(!available)('marks multiple messages as read', async () => {
    const ids = await Promise.all(
      Array.from({ length: 3 }).map(() => adapter.create({ input: baseInput }))
    );

    await adapter.markAsRead(ids, '2025-09-29T12:10:00.000Z');

    const { rows } = await client.query('select status, read_at from messaging.messages where id = any($1)', [ids]);
    expect(rows.every(row => row.status === 'read')).toBe(true);
  });

  it.skipIf(!available)('soft deletes message without removing row', async () => {
    const id = await adapter.create({ input: baseInput });

    await adapter.softDelete(id, '2025-09-29T12:20:00.000Z');

    const { rows } = await client.query('select deleted_at from messaging.messages where id=$1', [id]);
    expect(new Date(rows[0]?.deleted_at).toISOString()).toBe('2025-09-29T12:20:00.000Z');
  });

  it.skipIf(!available)('rejects update for missing message', async () => {
    await expect(
      adapter.updateStatus(crypto.randomUUID(), 'delivered', '2025-09-29T12:01:00.000Z')
    ).resolves.toBeUndefined();
  });
});

