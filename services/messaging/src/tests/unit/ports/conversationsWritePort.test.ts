import { describe, it, expect, beforeEach } from 'vitest';

import {
  createInMemoryConversationsWriteAdapter,
  createInMemoryConversationStore
} from '../../../ports/conversations/inMemory';

const baseInput = {
  type: 'group' as const,
  participantIds: ['f9ca6c0c-1930-4f03-8e6f-c4c72a22c02e'],
  name: 'Team Chat'
};

const actor = { id: '82fcbac5-9583-40d7-8a0e-d728621f0a4e', role: 'user' as const };

describe('InMemoryConversationsWriteAdapter', () => {
  const store = createInMemoryConversationStore();
  const adapter = createInMemoryConversationsWriteAdapter({ now: () => new Date(), store });

  beforeEach(() => {
    store.conversations.clear();
  });

  it('creates conversations with participants', async () => {
    const id = await adapter.create(baseInput, actor);

    const conversation = store.conversations.get(id);
    expect(conversation?.participants).toHaveLength(2); // actor + participant
    expect(conversation?.participants.find(p => p.userId === actor.id)?.role).toBe('owner');
  });

  it('updates participants lifecycle', async () => {
    const conversationId = await adapter.create(baseInput, actor);

    await adapter.updateParticipants(
      conversationId,
      {
        add: [{ userId: '87db7aeb-dcd2-4dd8-aef2-03f801b7e44e', role: 'member' }]
      },
      actor
    );

    await adapter.updateParticipants(
      conversationId,
      {
        remove: ['87db7aeb-dcd2-4dd8-aef2-03f801b7e44e']
      },
      actor
    );

    const conversation = store.conversations.get(conversationId);
    const participant = conversation?.participants.find(p => p.userId === '87db7aeb-dcd2-4dd8-aef2-03f801b7e44e');
    expect(participant?.leftAt).toBeDefined();
  });

  it('marks read receipts', async () => {
    const conversationId = await adapter.create(baseInput, actor);

    const readAt = '2025-09-29T12:00:00.000Z';
    await adapter.markRead(conversationId, actor.id, readAt);

    const conversation = store.conversations.get(conversationId);
    const participant = conversation?.participants.find(p => p.userId === actor.id);
    expect(participant?.lastReadAt).toBe(readAt);
  });

  it('updates settings and metadata', async () => {
    const conversationId = await adapter.create(baseInput, actor);

    await adapter.updateSettings(conversationId, { whoCanAddParticipants: 'owner' }, actor);
    await adapter.updateMetadata(conversationId, { description: 'Updated' }, actor);

    const conversation = store.conversations.get(conversationId);
    expect(conversation?.settings.whoCanAddParticipants).toBe('owner');
    expect(conversation?.description).toBe('Updated');
  });

  it('soft deletes conversations', async () => {
    const conversationId = await adapter.create(baseInput, actor);

    const deletedAt = '2025-09-29T13:00:00.000Z';
    await adapter.softDelete(conversationId, deletedAt, actor);

    expect(store.conversations.get(conversationId)?.deletedAt).toBe(deletedAt);
  });
});

