import { describe, expect, it } from 'vitest';

import {
  createPostgresMessagesReadAdapter
} from '../../../../ports/messages/postgres/messagesReadAdapter';
import {
  createPostgresMessagesWriteAdapter
} from '../../../../ports/messages/postgres/messagesWriteAdapter';
import { setupDatabaseTests } from '../../helpers/setupDatabase';

const baseInput = {
  conversationId: '6bdfc2c4-0fd3-4a46-8c7a-5ad1e5f8f364',
  senderId: '2e3d5163-8a07-4be6-80c1-56c6df4ac0e2',
  type: 'text' as const,
  encryptedContent: 'SGVsbG8='
};

describe('PostgresMessagesReadAdapter (integration)', () => {
  if (!process.env.DATABASE_URL) {
    it.skip('skipped: DATABASE_URL not configured');
    return;
  }

  const { client, available } = setupDatabaseTests(process.env.DATABASE_URL, {
    truncateTables: ['messaging.message_idempotency', 'messaging.messages']
  });

  const now = () => new Date('2025-09-29T12:00:00.000Z');

  const write = createPostgresMessagesWriteAdapter({ sql: client, now });
  const read = createPostgresMessagesReadAdapter({ sql: client });

  const seedMessages = async (count: number) => {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const id = await write.create({
        input: {
          ...baseInput,
          senderId: index % 2 === 0 ? baseInput.senderId : '53e21718-8e68-4b1d-b47f-c2e49816f1f5',
          encryptedContent: Buffer.from(`message-${index}`).toString('base64')
        }
      });
      ids.push(id);
      await client.query('update messaging.messages set created_at = $2 where id = $1', [id, new Date(2025, 8, 29, 12, index).toISOString()]);
    }
    return ids;
  };

  it.skipIf(!available)('finds messages by id', async () => {
    const [id] = await seedMessages(1);
    const message = await read.findById(id);
    expect(message?.id).toBe(id);
  });

  it.skipIf(!available)('lists messages by filters', async () => {
    await seedMessages(3);

    const messages = await read.list({ conversationId: baseInput.conversationId, senderId: baseInput.senderId });
    expect(messages.every(message => message.senderId === baseInput.senderId)).toBe(true);
  });

  it.skipIf(!available)('supports includeDeleted flag', async () => {
    await seedMessages(1);
    const [id] = await seedMessages(1);
    await client.query('update messaging.messages set deleted_at = $2 where id=$1', [id, '2025-09-29T12:05:00.000Z']);

    const withoutDeleted = await read.list({ conversationId: baseInput.conversationId, includeDeleted: false });
    expect(withoutDeleted.some(message => message.id === id)).toBe(false);

    const withDeleted = await read.list({ conversationId: baseInput.conversationId, includeDeleted: true });
    expect(withDeleted.some(message => message.id === id)).toBe(true);
  });

  it.skipIf(!available)('paginates with cursor', async () => {
    await seedMessages(5);

    let cursor: string | undefined;
    const received: string[] = [];

    for (;;) {
      const page = await read.listPage({ conversationId: baseInput.conversationId }, cursor, 2);
      received.push(...page.items.map(item => item.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(received).toHaveLength(5);
    expect(new Set(received).size).toBe(5);
  });

  it.skipIf(!available)('counts messages by filter', async () => {
    await seedMessages(4);

    const count = await read.count({ conversationId: baseInput.conversationId, senderId: baseInput.senderId });
    expect(count).toBe(2);
  });
});

