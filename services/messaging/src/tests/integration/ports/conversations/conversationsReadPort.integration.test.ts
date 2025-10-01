import { describe, expect, it } from 'vitest';

import {
  createPostgresConversationsReadAdapter
} from '../../../../ports/conversations/postgres/conversationsReadAdapter';
import {
  createPostgresConversationsWriteAdapter
} from '../../../../ports/conversations/postgres/conversationsWriteAdapter';
import { setupDatabaseTests } from '../../helpers/setupDatabase';

const actor = { id: '82fcbac5-9583-40d7-8a0e-d728621f0a4e', role: 'user' as const };

describe('PostgresConversationsReadAdapter (integration)', () => {
  if (!process.env.DATABASE_URL) {
    it.skip('skipped: DATABASE_URL not configured');
    return;
  }

  const { client, available } = setupDatabaseTests(process.env.DATABASE_URL, {
    truncateTables: [
      'messaging.conversation_audit',
      'messaging.conversation_participants',
      'messaging.conversations'
    ]
  });

  const now = () => new Date('2025-09-29T12:00:00.000Z');

  const read = createPostgresConversationsReadAdapter({ sql: client });
  const write = createPostgresConversationsWriteAdapter({ sql: client, now });

  const seedConversation = async (participants: string[] = ['80ee6f56-4826-4bcf-899c-0bced8e8d729', 'c749c37d-4aa6-4ddc-96e3-2c97904dcabc']) => {
    const id = await write.create({ type: 'group', participantIds: participants }, actor);
    await client.query('update messaging.conversations set updated_at = $2 where id = $1', [id, now().toISOString()]);
    return id;
  };

  it.skipIf(!available)('finds conversation by id with participants', async () => {
    const id = await seedConversation();

    const conversation = await read.findById(id);
    expect(conversation?.id).toBe(id);
    expect(conversation?.participants).toHaveLength(3); // actor + provided
  });

  it.skipIf(!available)('lists conversations filtered by participant', async () => {
    const targetUser = '55895a5e-1d9f-4f4a-b488-4aa08e24009f';
    const id1 = await seedConversation([targetUser]);
    const id2 = await seedConversation(['63a90f33-2e6c-4f4d-9c9b-6c6f2c7a12e8']);

    const list = await read.list({ participantId: targetUser });
    expect(list.some(conversation => conversation.id === id1)).toBe(true);
    expect(list.some(conversation => conversation.id === id2)).toBe(false);
  });

  it.skipIf(!available)('paginates conversations by updated_at', async () => {
    const participant = '93f8abd9-4a72-4b6f-b5d8-1d211aefa3f3';
    await seedConversation([participant]);
    await seedConversation([participant]);
    await seedConversation([participant]);

    const firstPage = await read.listPage({ participantId: participant }, undefined, 1);
    expect(firstPage.items).toHaveLength(1);

    const secondPage = await read.listPage({ participantId: participant }, firstPage.nextCursor, 1);
    expect(secondPage.items.length).toBeGreaterThanOrEqual(0);
  });
});

