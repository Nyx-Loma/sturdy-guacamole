import { describe, it, expect } from 'vitest';

import {
  createInMemoryMessagesWriteAdapter,
  createInMemoryMessageStore
} from '../../../ports/messages/inMemory';

const baseInput = {
  conversationId: '0d2e7c8e-3efd-4bc3-8f61-017e2e854b1e',
  senderId: '61fb4f5a-63bb-4b4c-85de-42cb0fcd6b6f',
  type: 'text' as const,
  encryptedContent: 'SGVsbG8sIFdvcmxkIQ=='
};

describe('InMemoryMessagesWriteAdapter', () => {
  it('creates messages and returns generated id', async () => {
    const store = createInMemoryMessageStore();
    const adapter = createInMemoryMessagesWriteAdapter({ now: () => new Date(), store });

    const id = await adapter.create({ input: baseInput });

    expect(id).toMatch(/[0-9a-f-]{36}/);
    expect(store.messages.get(id)).toBeDefined();
  });

  it('is idempotent when idempotency key is provided', async () => {
    const store = createInMemoryMessageStore();
    const adapter = createInMemoryMessagesWriteAdapter({ now: () => new Date(), store });

    const command = { input: baseInput, idempotencyKey: 'send-1' };

    const id1 = await adapter.create(command);
    const id2 = await adapter.create(command);

    expect(id1).toBe(id2);
  });

  it('updates status transitions while tracking timestamps', async () => {
    const fixedDate = new Date('2025-09-29T12:00:00.000Z');
    const store = createInMemoryMessageStore();
    const adapter = createInMemoryMessagesWriteAdapter({ now: () => fixedDate, store, generateId: () => 'msg-1' });

    const id = await adapter.create({ input: baseInput });

    const deliveredAt = '2025-09-29T12:01:00.000Z';
    await adapter.updateStatus(id, 'delivered', deliveredAt);

    const readAt = '2025-09-29T12:02:00.000Z';
    await adapter.updateStatus(id, 'read', readAt);

    const message = store.messages.get(id);
    expect(message?.status).toBe('read');
    expect(message?.deliveredAt).toBe(deliveredAt);
    expect(message?.readAt).toBe(readAt);
  });

  it('marks multiple messages as read', async () => {
    const store = createInMemoryMessageStore();
    const adapter = createInMemoryMessagesWriteAdapter({ now: () => new Date(), store });

    const id1 = await adapter.create({ input: baseInput });
    const id2 = await adapter.create({ input: baseInput });

    const readAt = '2025-09-29T12:05:00.000Z';
    await adapter.markAsRead([id1, id2], readAt);

    expect(store.messages.get(id1)?.status).toBe('read');
    expect(store.messages.get(id2)?.status).toBe('read');
  });

  it('soft deletes messages', async () => {
    const store = createInMemoryMessageStore();
    const adapter = createInMemoryMessagesWriteAdapter({ now: () => new Date(), store });

    const id = await adapter.create({ input: baseInput });

    const deletedAt = '2025-09-29T12:10:00.000Z';
    await adapter.softDelete(id, deletedAt);

    expect(store.messages.get(id)?.deletedAt).toBe(deletedAt);
  });
});

