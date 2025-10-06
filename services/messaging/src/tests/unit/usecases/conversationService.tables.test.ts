import { describe, expect, test, vi, beforeEach } from 'vitest';

import { createConversationService } from '../../../usecases/conversations/conversationService';

const now = () => new Date('2025-10-01T00:00:00.000Z');

const baseConversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'conversation-id',
  type: 'group',
  name: 'Group',
  description: 'Desc',
  avatarUrl: undefined,
  settings: {
    whoCanAddParticipants: 'admin',
    whoCanSendMessages: 'member',
    messageRetentionDays: 0,
    e2eeEnabled: true,
    maxParticipants: 5
  },
  metadata: undefined,
  createdAt: '2025-09-01T00:00:00.000Z',
  updatedAt: '2025-09-01T00:00:00.000Z',
  deletedAt: undefined,
  lastMessageId: undefined,
  lastMessageAt: undefined,
  lastMessagePreview: undefined,
  participants: [
    {
      userId: 'owner-id',
      role: 'owner',
      joinedAt: '2025-09-01T00:00:00.000Z',
      leftAt: undefined,
      lastReadAt: undefined,
      muted: false,
      mutedUntil: undefined
    }
  ],
  ...overrides
});

const actor = { id: 'owner-id', role: 'owner' as const };

const createDeps = () => {
  const read = {
    findById: vi.fn()
  } as unknown as Parameters<typeof createConversationService>[0]['read'];

  const write = {
    create: vi.fn(),
    updateParticipants: vi.fn(),
    markRead: vi.fn(),
    updateSettings: vi.fn(),
    updateMetadata: vi.fn(),
    softDelete: vi.fn()
  } as unknown as Parameters<typeof createConversationService>[0]['write'];

  const events = {
    updateLastMessage: vi.fn(),
    publish: vi.fn()
  } as unknown as Parameters<typeof createConversationService>[0]['events'];

  const service = createConversationService({ read, write, events, now });

  const reset = () => {
    vi.restoreAllMocks();
  };

  return { service, read, write, events, reset };
};

describe('conversationService.create', () => {
  const { service, write, events, reset } = createDeps();

  beforeEach(reset);

  test('writes conversation and publishes event', async () => {
    write.create = vi.fn(async () => 'generated-id');

    const created = await service.create({ type: 'group', participantIds: ['owner-id', 'other'] }, actor);

    expect(created).toBe('generated-id');
    expect(write.create).toHaveBeenCalledWith({ type: 'group', participantIds: ['owner-id', 'other'] }, actor);
    expect(events.publish).toHaveBeenCalledWith({ kind: 'ConversationCreated', id: 'generated-id' });
  });
});

describe('conversationService.addParticipants', () => {
  const { service, read, write, events, reset } = createDeps();

  beforeEach(reset);

  test('validates permissions and capacity', async () => {
    read.findById = vi.fn(async () => baseConversation());

    await service.addParticipants('conversation-id', [{ userId: 'new', role: 'member' }], actor);

    expect(write.updateParticipants).toHaveBeenCalledWith('conversation-id', { add: [{ userId: 'new', role: 'member' }] }, actor);
    expect(events.publish).toHaveBeenCalledWith({ kind: 'ParticipantAdded', conversationId: 'conversation-id', userId: 'new' });
  });

  test('throws when capacity exceeded', async () => {
    read.findById = vi.fn(async () => baseConversation({
      participants: [
        ...Array.from({ length: 5 }).map((_, index) => ({
          userId: `user-${index}`,
          role: 'member',
          joinedAt: '2025-09-01T00:00:00.000Z',
          leftAt: undefined,
          lastReadAt: undefined,
          muted: false,
          mutedUntil: undefined
        })),
        {
          userId: actor.id,
          role: 'owner',
          joinedAt: '2025-09-01T00:00:00.000Z',
          leftAt: undefined,
          lastReadAt: undefined,
          muted: false,
          mutedUntil: undefined
        }
      ]
    }));

    await expect(
      service.addParticipants('conversation-id', [{ userId: 'overflow', role: 'member' }], actor)
    ).rejects.toThrow('Conversation conversation-id is full');
  });
});

describe('conversationService.removeParticipant', () => {
  const { service, read, write, events, reset } = createDeps();

  beforeEach(reset);

  test('prevents removing higher role', async () => {
    read.findById = vi.fn(async () => baseConversation({
      participants: [
        {
          userId: actor.id,
          role: 'admin',
          joinedAt: '2025-09-01T00:00:00.000Z',
          leftAt: undefined,
          lastReadAt: undefined,
          muted: false,
          mutedUntil: undefined
        },
        {
          userId: 'target',
          role: 'owner',
          joinedAt: '2025-09-01T00:00:00.000Z',
          leftAt: undefined,
          lastReadAt: undefined,
          muted: false,
          mutedUntil: undefined
        }
      ]
    }));

    await expect(service.removeParticipant('conversation-id', 'target', actor)).rejects.toThrow('Insufficient permissions');
  });

  test('removes participant and publishes event', async () => {
    read.findById = vi.fn(async () => baseConversation({
      participants: [
        {
          userId: actor.id,
          role: 'owner',
          joinedAt: '2025-09-01T00:00:00.000Z',
          leftAt: undefined,
          lastReadAt: undefined,
          muted: false,
          mutedUntil: undefined
        },
        {
          userId: 'target',
          role: 'member',
          joinedAt: '2025-09-01T00:00:00.000Z',
          leftAt: undefined,
          lastReadAt: undefined,
          muted: false,
          mutedUntil: undefined
        }
      ]
    }));

    await service.removeParticipant('conversation-id', 'target', actor);

    expect(write.updateParticipants).toHaveBeenCalledWith('conversation-id', { remove: ['target'] }, actor);
    expect(events.publish).toHaveBeenCalledWith({ kind: 'ParticipantRemoved', conversationId: 'conversation-id', userId: 'target' });
  });
});

describe('conversationService.updateSettings/Metadata', () => {
  const { service, read, write, reset } = createDeps();

  beforeEach(reset);

  test('updates settings when actor has permission', async () => {
    read.findById = vi.fn(async () => baseConversation());

    await service.updateSettings('conversation-id', { messageRetentionDays: 30 }, actor);

    expect(write.updateSettings).toHaveBeenCalledWith('conversation-id', { messageRetentionDays: 30 }, actor);
  });

  test('throws if actor not participant', async () => {
    read.findById = vi.fn(async () => baseConversation({
      participants: [
        {
          userId: 'someone-else',
          role: 'owner',
          joinedAt: '2025-09-01T00:00:00.000Z',
          leftAt: undefined,
          lastReadAt: undefined,
          muted: false,
          mutedUntil: undefined
        }
      ]
    }));

    await expect(service.updateMetadata('conversation-id', { name: 'new-name' }, actor)).rejects.toThrow('not a participant');
  });
});

describe('conversationService.markRead/softDelete', () => {
  const { service, write, events, reset } = createDeps();

  beforeEach(reset);

  test('markRead uses provided timestamp or now', async () => {
    await service.markRead('conversation-id', actor.id, '2025-09-30T00:00:00.000Z');
    expect(write.markRead).toHaveBeenCalledWith('conversation-id', actor.id, '2025-09-30T00:00:00.000Z');

    write.markRead = vi.fn();
    await service.markRead('conversation-id', actor.id);
    expect(write.markRead).toHaveBeenCalledWith('conversation-id', actor.id, now().toISOString());
  });

  test('softDelete falls back to system actor and publishes', async () => {
    await service.softDelete('conversation-id');
    expect(write.softDelete).toHaveBeenCalledWith('conversation-id', now().toISOString(), { id: 'system', role: 'owner' });
    expect(events.publish).toHaveBeenCalledWith({ kind: 'ConversationSoftDeleted', id: 'conversation-id' });
  });
});

describe('conversationService.listParticipants', () => {
  test('returns sorted participants with pagination', async () => {
    const { service, read } = createDeps();
    read.findById = vi.fn(async () => baseConversation({
      participants: [
        { userId: 'c', role: 'member', joinedAt: '2025-09-01T00:00:05.000Z', leftAt: undefined, lastReadAt: undefined, muted: false, mutedUntil: undefined },
        { userId: 'a', role: 'member', joinedAt: '2025-09-01T00:00:01.000Z', leftAt: undefined, lastReadAt: undefined, muted: false, mutedUntil: undefined },
        { userId: 'b', role: 'member', joinedAt: '2025-09-01T00:00:03.000Z', leftAt: undefined, lastReadAt: undefined, muted: false, mutedUntil: undefined }
      ]
    }));

    const page = await service.listParticipants('conversation-id', { limit: 2 });
    expect(page.items.map(p => p.userId)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe('2025-09-01T00:00:03.000Z');
  });

  test('applies cursor to resume listing', async () => {
    const { service, read } = createDeps();
    read.findById = vi.fn(async () => baseConversation({
      participants: [
        { userId: 'a', role: 'member', joinedAt: '2025-09-01T00:00:01.000Z', leftAt: undefined, lastReadAt: undefined, muted: false, mutedUntil: undefined },
        { userId: 'b', role: 'member', joinedAt: '2025-09-01T00:00:03.000Z', leftAt: undefined, lastReadAt: undefined, muted: false, mutedUntil: undefined },
        { userId: 'c', role: 'member', joinedAt: '2025-09-01T00:00:05.000Z', leftAt: undefined, lastReadAt: undefined, muted: false, mutedUntil: undefined }
      ]
    }));

    const page = await service.listParticipants('conversation-id', { cursor: '2025-09-01T00:00:03.000Z' });
    expect(page.items.map(p => p.userId)).toEqual(['c']);
    expect(page.nextCursor).toBeUndefined();
  });

  test('throws when conversation missing', async () => {
    const { service, read } = createDeps();
    read.findById = vi.fn(async () => null);

    await expect(service.listParticipants('missing-id')).rejects.toThrow('Conversation not found');
  });
});


