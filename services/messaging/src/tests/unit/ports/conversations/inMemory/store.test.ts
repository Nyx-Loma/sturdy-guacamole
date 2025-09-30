import { describe, expect, test } from 'vitest';

import {
  createInMemoryConversationStore,
  upsertParticipant
} from '../../../../../ports/conversations/inMemory/store';

const participant = (userId: string) => ({
  userId,
  role: 'member' as const,
  joinedAt: new Date().toISOString(),
  muted: false
});

describe('createInMemoryConversationStore', () => {
  test('returns map container', () => {
    const store = createInMemoryConversationStore();
    expect(store.conversations instanceof Map).toBe(true);
    expect(store.conversations.size).toBe(0);
  });
});

describe('upsertParticipant', () => {
  test('adds new participant when missing', () => {
    const participants = [] as ReturnType<typeof participant>[];
    const newParticipant = participant('user-1');
    upsertParticipant(participants, newParticipant);

    expect(participants).toHaveLength(1);
    expect(participants[0]).toBe(newParticipant);
  });

  test('replaces existing active participant', () => {
    const existing = participant('user-1');
    const participants = [existing];
    const updated = { ...existing, role: 'admin' as const };

    upsertParticipant(participants, updated);

    expect(participants).toHaveLength(1);
    expect(participants[0].role).toBe('admin');
  });

  test('adds participant when previous entry is left', () => {
    const existing = { ...participant('user-1'), leftAt: new Date().toISOString() };
    const participants = [existing];
    const newEntry = participant('user-1');

    upsertParticipant(participants, newEntry);

    expect(participants).toHaveLength(2);
    expect(participants[1]).toBe(newEntry);
  });
});

