import { describe, expect, it } from 'vitest';

import {
  createPostgresConversationsWriteAdapter
} from '../../../../ports/conversations/postgres/conversationsWriteAdapter';
import { setupDatabaseTests } from '../../helpers/setupDatabase';

const actor = { id: '82fcbac5-9583-40d7-8a0e-d728621f0a4e', role: 'user' as const };

describe('PostgresConversationsWriteAdapter (integration)', () => {
  if (!process.env.DATABASE_URL) {
    it.skip('skipped: DATABASE_URL not configured');
    return;
  }

  const { client, available } = setupDatabaseTests(process.env.DATABASE_URL, {
    truncateTables: [
      'messaging.messages',
      'messaging.conversation_audit',
      'messaging.conversation_participants',
      'messaging.conversations'
    ]
  });

  const adapter = createPostgresConversationsWriteAdapter({
    sql: client,
    now: () => new Date('2025-09-29T12:00:00.000Z')
  });

  const participantA = '80ee6f56-4826-4bcf-899c-0bced8e8d729';
  const participantB = 'c749c37d-4aa6-4ddc-96e3-2c97904dcabc';
  const participantC = '93f8abd9-4a72-4b6f-b5d8-1d211aefa3f3';

  const createConversation = async (participants: string[] = [participantA, participantB]) => {
    return adapter.create({ type: 'group', participantIds: participants }, actor);
  };

  it.skipIf(!available)('creates conversation with participants and audit record', async () => {
    const id = await createConversation();

    const { rowCount } = await client.query('select * from messaging.conversations where id = $1', [id]);
    expect(rowCount).toBe(1);

    const audit = await client.query('select * from messaging.conversation_audit where conversation_id = $1', [id]);
    expect(audit.rowCount).toBe(1);
  });

  it.skipIf(!available)('updates participant lifecycle', async () => {
    const conversationId = await createConversation();

    await adapter.updateParticipants(
      conversationId,
      { add: [{ userId: participantC, role: 'member' }] },
      actor
    );

    const participants = await client.query('select * from messaging.conversation_participants where conversation_id = $1', [conversationId]);
    expect(participants.rowCount).toBeGreaterThan(1);
  });

  it.skipIf(!available)('updates metadata and settings', async () => {
    const id = await createConversation();

    await adapter.updateMetadata(id, { name: 'Team A', description: 'Updated desc' }, actor);
    await adapter.updateSettings(id, { whoCanAddParticipants: 'owner' }, actor);

    const { rows } = await client.query('select name, description, settings from messaging.conversations where id=$1', [id]);
    expect(rows[0].name).toBe('Team A');
    expect(rows[0].description).toBe('Updated desc');
    expect(rows[0].settings.whoCanAddParticipants).toBe('owner');
  });

  it.skipIf(!available)('soft deletes conversations', async () => {
    const id = await createConversation();

    await adapter.softDelete(id, '2025-09-29T13:00:00.000Z', actor);

    const { rows } = await client.query('select deleted_at from messaging.conversations where id=$1', [id]);
    const deletedAtIso = rows[0]?.deleted_at && new Date(rows[0]?.deleted_at).toISOString();
    expect(deletedAtIso).toBe('2025-09-29T13:00:00.000Z');
  });
});

