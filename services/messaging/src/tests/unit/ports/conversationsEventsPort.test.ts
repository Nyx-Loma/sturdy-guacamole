import { describe, it, expect, beforeEach } from 'vitest';

import {
  createInMemoryConversationStore,
  createInMemoryConversationsEventsAdapter,
  createInMemoryConversationsWriteAdapter
} from '../../../ports/conversations/inMemory';
import type { LastMessageUpdate } from '../../../ports/conversations/conversationsEventsPort';

const actor = { id: '82fcbac5-9583-40d7-8a0e-d728621f0a4e', role: 'user' as const };

describe('InMemoryConversationsEventsAdapter', () => {
  const store = createInMemoryConversationStore();
  const write = createInMemoryConversationsWriteAdapter({ now: () => new Date(), store });
  const events = createInMemoryConversationsEventsAdapter({ store });

  beforeEach(() => {
    store.conversations.clear();
  });

  it('updates denormalized last message fields', async () => {
    const conversationId = await write.create({ type: 'group', participantIds: ['member'] }, actor);

    const update: LastMessageUpdate = {
      conversationId,
      messageId: 'message-id',
      preview: 'preview',
      occurredAt: '2025-09-29T12:00:00.000Z'
    };

    await events.updateLastMessage(update);

    const conversation = store.conversations.get(conversationId);
    expect(conversation?.lastMessageId).toBe('message-id');
    expect(conversation?.lastMessagePreview).toBe('preview');
  });

  it('publishes events as no-op in memory', async () => {
    await expect(events.publish({ kind: 'ConversationCreated', id: 'conv' })).resolves.toBeUndefined();
  });
});

