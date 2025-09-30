import { beforeEach, describe, expect, test } from 'vitest';

import {
  createInMemoryConversationStore,
  createInMemoryConversationsWriteAdapter
} from '../../../../ports/conversations/inMemory';

const actor = { id: '82fcbac5-9583-40d7-8a0e-d728621f0a4e', role: 'user' as const };

const baseInput = () => ({
  type: 'group' as const,
  participantIds: [crypto.randomUUID(), crypto.randomUUID()],
  name: 'Team Chat'
});

const setup = () => {
  const store = createInMemoryConversationStore();
  const adapter = createInMemoryConversationsWriteAdapter({ now: () => new Date(), store });
  const reset = () => store.conversations.clear();
  return { store, adapter, reset };
};

describe('conversationsWritePort.create()', () => {
  const { store, adapter, reset } = setup();

  beforeEach(reset);

  test.each([
    {
      name: 'group conversation with metadata',
      input: { ...baseInput(), metadata: { topic: 'release' } }
    },
    {
      name: 'direct conversation adds actor automatically',
      input: { type: 'direct' as const, participantIds: [crypto.randomUUID()] }
    },
    {
      name: 'channel conversation without name',
      input: { type: 'channel' as const, participantIds: [crypto.randomUUID(), crypto.randomUUID()] }
    }
  ])('case: %s', async ({ input }) => {
    const id = await adapter.create(input as any, actor);
    const conversation = store.conversations.get(id);

    expect(conversation?.id).toBeDefined();
    expect(conversation?.participants.length).toBeGreaterThan(0);
  });
});

describe('conversationsWritePort.updateParticipants()', () => {
  const { store, adapter, reset } = setup();

  beforeEach(reset);

  test.each([
    {
      name: 'add two members',
      changes: {
        add: [
          { userId: crypto.randomUUID(), role: 'member' as const },
          { userId: crypto.randomUUID(), role: 'admin' as const }
        ]
      }
    },
    {
      name: 'promote a member to admin',
      changes: () => {
        const uid = crypto.randomUUID();
        return {
          add: [{ userId: uid, role: 'member' as const }],
          updateRole: [{ userId: uid, role: 'admin' as const }]
        };
      }
    },
    {
      name: 'remove a member',
      changes: () => {
        const uid = crypto.randomUUID();
        return {
          add: [{ userId: uid, role: 'member' as const }],
          remove: [uid]
        };
      }
    }
  ])('case: %s', async ({ changes }) => {
    const conversationId = await adapter.create(baseInput(), actor);
    const mutation = typeof changes === 'function' ? changes() : changes;

    await adapter.updateParticipants(conversationId, mutation, actor);
    const conversation = store.conversations.get(conversationId)!;

    expect(conversation.updatedAt).toBeDefined();
  });
});

describe('conversationsWritePort state mutations', () => {
  const { store, adapter, reset } = setup();

  beforeEach(reset);

  test('mark read, update settings, metadata, soft delete', async () => {
    const conversationId = await adapter.create(baseInput(), actor);

    const readAt = '2025-09-29T12:05:00.000Z';
    await adapter.markRead(conversationId, actor.id, readAt);

    await adapter.updateSettings(conversationId, { messageRetentionDays: 30 }, actor);
    await adapter.updateMetadata(conversationId, { name: 'Renamed', description: 'New desc' }, actor);
    await adapter.softDelete(conversationId, '2025-09-29T13:00:00.000Z', actor);

    const conversation = store.conversations.get(conversationId)!;
    expect(conversation.participants.find(p => p.userId === actor.id)?.lastReadAt).toBe(readAt);
    expect(conversation.settings.messageRetentionDays).toBe(30);
    expect(conversation.name).toBe('Renamed');
    expect(conversation.deletedAt).toBe('2025-09-29T13:00:00.000Z');
  });
});
