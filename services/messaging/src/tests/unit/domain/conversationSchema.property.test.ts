import { describe, expect, test } from 'vitest';
import fc from 'fast-check';

import {
  ConversationSchema,
  CreateConversationSchema,
  UpdateConversationSchema,
  ConversationType
} from '../../../domain/types/conversation.types';

const uuidArb = fc.uuid();
const isoDateArb = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2030, 11, 31, 23, 59, 59, 999) })
  .map(ms => new Date(ms).toISOString());

const participantArb = fc.record({
  userId: uuidArb,
  role: fc.constantFrom('owner', 'admin', 'member', 'observer'),
  joinedAt: isoDateArb,
  leftAt: fc.option(isoDateArb, { nil: undefined }),
  lastReadAt: fc.option(isoDateArb, { nil: undefined }),
  muted: fc.boolean(),
  mutedUntil: fc.option(isoDateArb, { nil: undefined })
});

const conversationArb = fc.record({
  id: uuidArb,
  type: fc.constantFrom('direct', 'group', 'channel'),
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  avatarUrl: fc.option(fc.webUrl(), { nil: undefined }),
  participants: fc.array(participantArb, { minLength: 1, maxLength: 6 }),
  settings: fc.record({
    whoCanAddParticipants: fc.constantFrom('owner', 'admin', 'member'),
    whoCanSendMessages: fc.constantFrom('owner', 'admin', 'member'),
    messageRetentionDays: fc.integer({ min: 0, max: 365 }),
    e2eeEnabled: fc.boolean(),
    maxParticipants: fc.integer({ min: 0, max: 100 })
  }),
  metadata: fc.option(fc.dictionary(fc.string(), fc.jsonValue()), { nil: undefined }),
  createdAt: isoDateArb,
  updatedAt: isoDateArb,
  lastMessageId: fc.option(uuidArb, { nil: undefined }),
  lastMessageAt: fc.option(isoDateArb, { nil: undefined }),
  lastMessagePreview: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  deletedAt: fc.option(isoDateArb, { nil: undefined })
}).filter(record => {
  if (record.type === ConversationType.DIRECT) {
    return record.participants.length === 2 && !record.name && !record.description;
  }
  return true;
});

const createConversationArb = fc.record({
  type: fc.constantFrom('direct', 'group', 'channel'),
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  avatarUrl: fc.option(fc.webUrl(), { nil: undefined }),
  participantIds: fc.array(uuidArb, { minLength: 1, maxLength: 4 }),
  settings: fc.option(fc.record({
    whoCanAddParticipants: fc.constantFrom('owner', 'admin', 'member'),
    whoCanSendMessages: fc.constantFrom('owner', 'admin', 'member'),
    messageRetentionDays: fc.integer({ min: 0, max: 365 }),
    e2eeEnabled: fc.boolean(),
    maxParticipants: fc.integer({ min: 0, max: 100 })
  }), { nil: undefined }),
  metadata: fc.option(fc.dictionary(fc.string(), fc.jsonValue()), { nil: undefined })
}).filter(record => {
  if (record.type === ConversationType.DIRECT) {
    return record.participantIds.length === 2 && !record.name && !record.description;
  }
  return true;
});

const updateConversationArb = fc.record({
  id: uuidArb,
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  avatarUrl: fc.option(fc.webUrl(), { nil: undefined }),
  settings: fc.option(fc.record({
    whoCanAddParticipants: fc.option(fc.constantFrom('owner', 'admin', 'member'), { nil: undefined }),
    whoCanSendMessages: fc.option(fc.constantFrom('owner', 'admin', 'member'), { nil: undefined }),
    messageRetentionDays: fc.option(fc.integer({ min: 0, max: 365 }), { nil: undefined }),
    e2eeEnabled: fc.option(fc.boolean(), { nil: undefined }),
    maxParticipants: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined })
  }), { nil: undefined }),
  metadata: fc.option(fc.dictionary(fc.string(), fc.jsonValue()), { nil: undefined })
});

describe('ConversationSchema property tests', () => {
  test('accepts generated conversations', () => {
    fc.assert(
      fc.property(conversationArb, value => {
        expect(() => ConversationSchema.parse(value)).not.toThrow();
      })
    );
  });
});

describe('CreateConversationSchema property tests', () => {
  test('accepts generated creation inputs', () => {
    fc.assert(
      fc.property(createConversationArb, value => {
        expect(() => CreateConversationSchema.parse(value)).not.toThrow();
      })
    );
  });
});

describe('UpdateConversationSchema property tests', () => {
  test('accepts generated updates', () => {
    fc.assert(
      fc.property(updateConversationArb, value => {
        expect(() => UpdateConversationSchema.parse(value)).not.toThrow();
      })
    );
  });
});

