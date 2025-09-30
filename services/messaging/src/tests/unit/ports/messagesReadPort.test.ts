import { describe, it, expect, beforeEach } from 'vitest';

import {
  createInMemoryMessagesReadAdapter,
  createInMemoryMessagesWriteAdapter,
  createInMemoryMessageStore
} from '../../../ports/messages/inMemory';

const baseInput = {
  conversationId: '0d2e7c8e-3efd-4bc3-8f61-017e2e854b1e',
  senderId: '61fb4f5a-63bb-4b4c-85de-42cb0fcd6b6f',
  type: 'text' as const,
  encryptedContent: 'SGVsbG8sIFdvcmxkIQ=='
};

describe('InMemoryMessagesReadAdapter', () => {
  const store = createInMemoryMessageStore();
  const write = createInMemoryMessagesWriteAdapter({ now: () => new Date(), store });
  const read = createInMemoryMessagesReadAdapter({ store });

  beforeEach(() => {
    store.messages.clear();
    store.clientIndex.clear();
  });

  it('retrieves message by id', async () => {
    const id = await write.create({ input: baseInput });

    const message = await read.findById(id);

    expect(message?.id).toBe(id);
  });

  it('lists messages with filters', async () => {
    await write.create({ input: baseInput });
    await write.create({ input: { ...baseInput, senderId: 'a9d75f4c-5b47-4ed4-91a0-69fb7f6e3d71', type: 'image' } });

    const all = await read.list({ conversationId: baseInput.conversationId });
    expect(all).toHaveLength(2);

    const onlyText = await read.list({ conversationId: baseInput.conversationId, type: 'text' });
    expect(onlyText).toHaveLength(1);
  });

  it('paginates results by cursor', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const id = await write.create({ input: baseInput });
      ids.push(id);
    }

    const firstPage = await read.listPage({ conversationId: baseInput.conversationId }, undefined, 2);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await read.listPage(
      { conversationId: baseInput.conversationId },
      firstPage.nextCursor,
      2
    );
    expect(secondPage.items).toHaveLength(2);
  });
});

