import { describe, it, expect, beforeEach } from 'vitest';

import {
  createInMemoryConversationStore,
  createInMemoryConversationsWriteAdapter,
  createInMemoryConversationsReadAdapter
} from '../../../ports/conversations/inMemory';

const actor = { id: '82fcbac5-9583-40d7-8a0e-d728621f0a4e', role: 'user' as const };

describe('InMemoryConversationsReadAdapter', () => {
  const store = createInMemoryConversationStore();
  const write = createInMemoryConversationsWriteAdapter({ now: () => new Date(), store });
  const read = createInMemoryConversationsReadAdapter({ store });

  beforeEach(() => {
    store.conversations.clear();
  });

  it('finds conversation by id', async () => {
    const conversationId = await write.create({ type: 'direct', participantIds: ['b'] }, actor);

    const conversation = await read.findById(conversationId);
    expect(conversation?.id).toBe(conversationId);
  });

  it('lists conversations by participant', async () => {
    await write.create({ type: 'group', participantIds: ['c'] }, actor);
    await write.create({ type: 'group', participantIds: ['d'] }, { id: 'c', role: 'user' });

    const conversations = await read.list({ participantId: actor.id });
    expect(conversations.length).toBeGreaterThan(0);
  });

  it('paginates with cursor', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const id = await write.create({ type: 'group', participantIds: [`member-${index}`] }, actor);
      ids.push(id);
    }

    const firstPage = await read.listPage({ participantId: actor.id }, undefined, 2);
    expect(firstPage.items).toHaveLength(2);

    const secondPage = await read.listPage(
      { participantId: actor.id },
      firstPage.nextCursor,
      2
    );
    expect(secondPage.items.length).toBeGreaterThan(0);
  });
});

