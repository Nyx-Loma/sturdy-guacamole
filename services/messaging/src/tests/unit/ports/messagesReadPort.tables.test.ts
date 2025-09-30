import { beforeEach, describe, expect, test } from 'vitest';

import {
  createInMemoryMessageStore,
  createInMemoryMessagesReadAdapter,
  createInMemoryMessagesWriteAdapter
} from '../../../ports/messages/inMemory';

const baseInput = {
  conversationId: 'a1816cc0-9d5f-4be1-a69a-70d3fdf5c5a9',
  senderId: '90ecdc1c-2160-4923-aa96-3e2c81f2f277',
  type: 'text' as const,
  encryptedContent: 'SGVsbG8='
};

const createAdapters = () => {
  const store = createInMemoryMessageStore();
  const write = createInMemoryMessagesWriteAdapter({ now: () => new Date(), store });
  const read = createInMemoryMessagesReadAdapter({ store });

  const reset = () => {
    store.messages.clear();
    store.clientIndex.clear();
  };

  return { store, write, read, reset };
};

describe('MessagesReadPort table-driven list()', () => {
  const { store, write, read, reset } = createAdapters();

  beforeEach(reset);

  test('filters by sender and type', async () => {
    await write.create({ input: baseInput });
    await write.create({ input: { ...baseInput, senderId: 'f495b9d8-5418-46dd-92c2-2bd6699a7aa2', type: 'image' } });

    const bySender = await read.list({
      conversationId: baseInput.conversationId,
      senderId: baseInput.senderId
    });
    expect(bySender).toHaveLength(1);

    const byType = await read.list({
      conversationId: baseInput.conversationId,
      type: 'image'
    });
    expect(byType).toHaveLength(1);
    expect(byType[0].type).toBe('image');
  });

  test('honors includeDeleted flag', async () => {
    const id = await write.create({ input: baseInput });
    const writeStore = store.messages.get(id)!;
    writeStore.deletedAt = '2025-09-01T10:00:00.000Z';

    const withoutDeleted = await read.list({ conversationId: baseInput.conversationId });
    expect(withoutDeleted).toHaveLength(0);

    const withDeleted = await read.list({
      conversationId: baseInput.conversationId,
      includeDeleted: true
    });
    expect(withDeleted).toHaveLength(1);
  });

  test('before/after filters', async () => {
    const created = await Promise.all(
      ['2025-09-20T10:00:00.000Z', '2025-09-21T10:00:00.000Z', '2025-09-22T10:00:00.000Z'].map((timestamp, index) =>
        write.create({ input: { ...baseInput, encryptedContent: Buffer.from(`msg-${index}`).toString('base64') } }).then(returnedId => {
          const stored = store.messages.get(returnedId)!;
          stored.createdAt = timestamp;
          stored.updatedAt = timestamp;
          store.messages.set(returnedId, stored);
          return returnedId;
        })
      )
    );

    const before = await read.list({
      conversationId: baseInput.conversationId,
      before: '2025-09-22T00:00:00.000Z'
    });
    expect(before).toHaveLength(2);

    const after = await read.list({
      conversationId: baseInput.conversationId,
      after: '2025-09-21T11:00:00.000Z'
    });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(created[2]);
  });
});

describe('MessagesReadPort count()', () => {
  const { write, read, reset } = createAdapters();

  beforeEach(reset);

  test('counts matching records', async () => {
    await write.create({ input: baseInput });
    await write.create({ input: { ...baseInput, senderId: 'another-sender-uuid' } });

    const total = await read.count({ conversationId: baseInput.conversationId });
    expect(total).toBe(2);

    const filtered = await read.count({
      conversationId: baseInput.conversationId,
      senderId: baseInput.senderId
    });
    expect(filtered).toBe(1);
  });
});

describe('MessagesReadPort listPage()', () => {
  const { store, write, read, reset } = createAdapters();

  beforeEach(reset);

  test('returns next cursor when more data remain', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }).map((_, idx) => write.create({
        input: {
          ...baseInput,
          encryptedContent: Buffer.from(`message-${idx}`).toString('base64')
        }
      }))
    );

    // ensure deterministic order
    ids.forEach((id, index) => {
      const timestamp = new Date(2025, 8, 29, 12, index).toISOString();
      const message = store.messages.get(id)!;
      message.createdAt = timestamp;
      message.updatedAt = timestamp;
    });

    const firstPage = await read.listPage({ conversationId: baseInput.conversationId }, undefined, 2);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await read.listPage({ conversationId: baseInput.conversationId }, firstPage.nextCursor, 2);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.nextCursor).toBeDefined();

    const lastPage = await read.listPage({ conversationId: baseInput.conversationId }, secondPage.nextCursor, 2);
    expect(lastPage.items).toHaveLength(1);
    expect(lastPage.nextCursor).toBeUndefined();
  });
});

