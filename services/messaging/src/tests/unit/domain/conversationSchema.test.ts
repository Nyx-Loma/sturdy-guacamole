import { describe, expect, test } from 'vitest';

import {
  ConversationSchema,
  CreateConversationSchema,
  UpdateConversationSchema,
  ParticipantSchema,
  ConversationType
} from '../../../domain/types/conversation.types';

const participant = (overrides: Record<string, unknown> = {}) => ({
  userId: 'e2b68e4a-d37a-4c68-bd19-2d13df458f5c',
  role: 'owner',
  joinedAt: '2025-09-29T12:00:00.000Z',
  muted: false,
  ...overrides
});

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'a7e7c9ee-a3c8-4cd8-a7f2-92a95fa2bb74',
  type: ConversationType.GROUP,
  name: 'Team Alpha',
  description: 'Weekly sync',
  avatarUrl: 'https://example.com/avatar.png',
  participants: [participant()],
  settings: {
    whoCanAddParticipants: 'admin',
    whoCanSendMessages: 'member',
    messageRetentionDays: 14,
    e2eeEnabled: true,
    maxParticipants: 10
  },
  metadata: { topic: 'shipping' },
  createdAt: '2025-09-29T12:00:00.000Z',
  updatedAt: '2025-09-29T12:00:00.000Z',
  ...overrides
});

describe('ConversationSchema', () => {
  test.each([
    conversation(),
    conversation({ description: undefined }),
    conversation({ metadata: undefined }),
    conversation({ settings: { ...conversation().settings, maxParticipants: 0 } }),
    conversation({
      type: ConversationType.DIRECT,
      name: undefined,
      description: undefined,
      participants: [
        participant(),
        participant({ userId: 'f6151cf6-8f8d-4f0d-a0f2-97b84e9f8a37', role: 'member' })
      ]
    })
  ])('accepts valid conversation %#', (value) => {
    expect(() => ConversationSchema.parse(value)).not.toThrow();
  });

  test.each([
    conversation({ id: 'not-uuid' }),
    conversation({ participants: [] }),
    conversation({ type: 'invalid' }),
    conversation({ settings: { ...conversation().settings, whoCanAddParticipants: 'invalid' } }),
    conversation({ metadata: 123 }),
    conversation({ type: ConversationType.DIRECT, name: 'illegal', participants: [participant()] }),
    conversation({
      type: ConversationType.DIRECT,
      participants: [
        participant(),
        participant({ userId: 'f6151cf6-8f8d-4f0d-a0f2-97b84e9f8a37', role: 'member' }),
        participant({ userId: 'e84617fb-6d0b-4351-9e05-577bdd66a3ea', role: 'member' })
      ]
    })
  ])('rejects invalid conversation %#', (value) => {
    expect(() => ConversationSchema.parse(value as any)).toThrow();
  });
});

describe('ParticipantSchema', () => {
  test.each([
    participant(),
    participant({ muted: true }),
    participant({ mutedUntil: '2025-09-29T13:00:00.000Z' })
  ])('accepts participant %#', (value) => {
    expect(() => ParticipantSchema.parse(value)).not.toThrow();
  });

  test.each([
    participant({ userId: 'not-uuid' }),
    participant({ role: 'invalid' }),
    participant({ joinedAt: 'not-date' }),
    participant({ muted: 'nope' })
  ])('rejects participant %#', (value) => {
    expect(() => ParticipantSchema.parse(value as any)).toThrow();
  });
});

describe('CreateConversationSchema', () => {
  const base = () => ({
    type: ConversationType.GROUP,
    participantIds: ['0f1dedf5-6e47-4207-9cc7-73a6f9b4f99b', '7fef5a37-8a63-48b2-8c05-2b3d678bfa42'],
    metadata: { topic: 'release' }
  });

  test.each([
    base(),
    { ...base(), settings: { whoCanAddParticipants: 'owner', whoCanSendMessages: 'member', messageRetentionDays: 1, e2eeEnabled: false, maxParticipants: 5 } },
    { type: ConversationType.DIRECT, participantIds: ['0f1dedf5-6e47-4207-9cc7-73a6f9b4f99b', '7fef5a37-8a63-48b2-8c05-2b3d678bfa42'] }
  ])('accepts create input %#', (value) => {
    expect(() => CreateConversationSchema.parse(value)).not.toThrow();
  });

  test.each([
    { type: ConversationType.DIRECT, participantIds: ['0f1dedf5-6e47-4207-9cc7-73a6f9b4f99b'] },
    { type: ConversationType.DIRECT, participantIds: ['0f1dedf5-6e47-4207-9cc7-73a6f9b4f99b', '7fef5a37-8a63-48b2-8c05-2b3d678bfa42'], name: 'illegal direct' },
    { type: ConversationType.GROUP, participantIds: [], metadata: {} }
  ])('rejects create input %#', (value) => {
    expect(() => CreateConversationSchema.parse(value as any)).toThrow();
  });
});

describe('UpdateConversationSchema', () => {
  const base = () => ({
    id: '3528d5e8-f6df-4f81-bbb9-8a822701e6e9',
    name: 'Updated',
    metadata: { topic: 'ops' }
  });

  test.each([
    base(),
    { ...base(), settings: { messageRetentionDays: 5 } },
    { ...base(), description: 'New description' }
  ])('accepts update input %#', (value) => {
    expect(() => UpdateConversationSchema.parse(value)).not.toThrow();
  });

  test.each([
    { ...base(), id: 'not-uuid' },
    { ...base(), avatarUrl: 'not-url' },
    { ...base(), settings: { maxParticipants: -1 } }
  ])('rejects update input %#', (value) => {
    expect(() => UpdateConversationSchema.parse(value as any)).toThrow();
  });
});

