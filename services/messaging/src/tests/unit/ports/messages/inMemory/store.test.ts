import { describe, expect, test } from 'vitest';

import {
  createInMemoryMessageStore,
  makeClientKey
} from '../../../../../ports/messages/inMemory/store';

describe('createInMemoryMessageStore', () => {
  test('provides empty maps', () => {
    const store = createInMemoryMessageStore();
    expect(store.messages.size).toBe(0);
    expect(store.clientIndex.size).toBe(0);
  });

  test('allows storing and retrieving message', () => {
    const store = createInMemoryMessageStore();
    const message = { id: 'a', conversationId: 'c', senderId: 's' } as any;
    store.messages.set(message.id, message);

    expect(store.messages.get('a')).toBe(message);
  });
});

describe('makeClientKey', () => {
  test('creates deterministic composite key', () => {
    const key = makeClientKey('sender-1', 'client-1');
    expect(key).toBe('sender-1:client-1');
  });

  test('differentiates by sender', () => {
    const key1 = makeClientKey('sender-1', 'client');
    const key2 = makeClientKey('sender-2', 'client');
    expect(key1).not.toBe(key2);
  });
});
