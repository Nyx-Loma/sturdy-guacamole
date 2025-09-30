import { describe, test, expect, beforeEach } from 'vitest';

import {
  createInMemoryMessagesWriteAdapter,
  createInMemoryMessageStore
} from '../../../ports/messages/inMemory';

const baseInput = {
  conversationId: '5fd1e2b2-5cbf-410f-8a0d-5c7b6a8161d0',
  senderId: 'fa91f075-16d3-4faa-90dd-e66f8d9b2d36',
  type: 'text' as const,
  encryptedContent: 'SGVsbG8sIHdvcmxkIQ=='
};

const newAdapter = () => {
  const store = createInMemoryMessageStore();
  let nowCounter = 0;
  let idCounter = 0;
  const adapter = createInMemoryMessagesWriteAdapter({
    now: () => new Date(1700000000000 + nowCounter++ * 60_000),
    store,
    generateId: () => `00000000-0000-0000-0000-${(idCounter++).toString().padStart(12, '0')}`
  });

  const reset = () => {
    store.messages.clear();
    store.clientIndex.clear();
    nowCounter = 0;
    idCounter = 0;
  };

  return { adapter, store, reset };
};

describe('MessagesWritePort table-driven create()', () => {
  const { adapter, store, reset } = newAdapter();

  beforeEach(reset);

  test.each([
    {
      name: 'stores optional metadata',
      input: {
        ...baseInput,
        metadata: { replyTo: 'msg-1' },
        contentMimeType: 'text/plain',
        contentSize: 42
      }
    },
    {
      name: 'handles binary attachments meta',
      input: {
        ...baseInput,
        type: 'file' as const,
        contentMimeType: 'application/pdf',
        contentSize: 1024
      }
    },
    {
      name: 'defaults missing optional fields',
      input: baseInput
    }
  ])('create %s', async ({ input }) => {
    const id = await adapter.create({ input });

    const stored = store.messages.get(id);
    expect(stored).toBeDefined();
    expect(stored?.conversationId).toBe(input.conversationId);
    expect(stored?.encryptedContent).toBe(input.encryptedContent);
  });

  test('idempotency isolates by sender', async () => {
    const idempotentCommand = {
      input: baseInput,
      idempotencyKey: 'client-key'
    } as const;

    const id1 = await adapter.create(idempotentCommand);
    const id2 = await adapter.create(idempotentCommand);

    expect(id1).toBe(id2);

    const otherSender = await adapter.create({
      input: { ...baseInput, senderId: '117a2cd2-4d7c-4320-b7a4-fd3d73d11e8f' },
      idempotencyKey: 'client-key'
    });

    expect(otherSender).not.toBe(id1);
  });

  test('multiple client ids map independently', async () => {
    const commands = ['a', 'b', 'c'].map(idempotencyKey => ({
      input: baseInput,
      idempotencyKey
    }));

    const created = await Promise.all(commands.map(command => adapter.create(command)));

    expect(new Set(created).size).toBe(commands.length);
  });
});

describe('MessagesWritePort table-driven updateStatus()', () => {
  const { adapter, store, reset } = newAdapter();

  beforeEach(reset);

  test.each([
    ['delivered', 'deliveredAt'],
    ['read', 'readAt'],
    ['failed', undefined],
    ['sent', undefined]
  ] as const)('status %s updates expected timestamps', async (status, timestampProp) => {
    const id = await adapter.create({ input: baseInput });

    const transitionTime = '2025-09-29T12:05:00.000Z';
    await adapter.updateStatus(id, status, transitionTime);

    const message = store.messages.get(id)!;
    expect(message.status).toBe(status);
    if (timestampProp) {
      expect(message[timestampProp]).toBe(transitionTime);
    } else {
      expect(message.deliveredAt ?? message.readAt).toBeUndefined();
    }
    expect(new Date(message.updatedAt).getTime()).toBeGreaterThan(new Date(message.createdAt).getTime());
  });

  test('read transition populates deliveredAt when missing', async () => {
    const id = await adapter.create({ input: baseInput });
    const message = store.messages.get(id)!;
    message.deliveredAt = undefined;

    await adapter.updateStatus(id, 'read', '2025-09-29T12:07:00.000Z');

    const updated = store.messages.get(id)!;
    expect(updated.readAt).toBe('2025-09-29T12:07:00.000Z');
    expect(updated.deliveredAt).toBe('2025-09-29T12:07:00.000Z');
  });
});

describe('MessagesWritePort markAsRead()', () => {
  const { adapter, store, reset } = newAdapter();

  beforeEach(reset);

  test('marks existing messages and ignores missing ids', async () => {
    const ids = await Promise.all(
      Array.from({ length: 3 }).map(() => adapter.create({ input: baseInput }))
    );

    await adapter.markAsRead([...ids, 'missing'], '2025-09-29T14:00:00.000Z');

    ids.forEach(id => {
      const message = store.messages.get(id)!;
      expect(message.status).toBe('read');
      expect(message.readAt).toBe('2025-09-29T14:00:00.000Z');
    });
  });

  test('no-op when ids empty and actor provided', async () => {
    await adapter.markAsRead([], '2025-09-29T12:10:00.000Z');
    expect(store.messages.size).toBe(0);
  });
});

describe('MessagesWritePort softDelete()', () => {
  const { adapter, store, reset } = newAdapter();

  beforeEach(reset);

  test('soft delete marks timestamp without removing message', async () => {
    const id = await adapter.create({ input: baseInput });

    await adapter.softDelete(id, '2025-09-30T09:00:00.000Z');

    const message = store.messages.get(id)!;
    expect(message.deletedAt).toBe('2025-09-30T09:00:00.000Z');
    expect(message.status).toBe('sent');
  });
});

